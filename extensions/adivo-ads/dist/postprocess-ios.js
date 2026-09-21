'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const child = require('child_process');

function walkForProject(root, depth = 0) {
  if (!root || !fs.existsSync(root) || depth > 7) return null;
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) return null;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const project = entries.find((entry) => entry.isDirectory() && entry.name.endsWith('.xcodeproj') && entry.name !== 'Pods.xcodeproj');
  if (project) return path.join(root, project.name);
  for (const entry of entries) {
    if (!entry.isDirectory() || ['Pods', 'node_modules', 'Library'].includes(entry.name)) continue;
    const found = walkForProject(path.join(root, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

function readConfig(projectRoot) {
  const configPath = path.join(projectRoot, 'assets/resources/Adivo.local.json');
  if (!fs.existsSync(configPath)) throw new Error('[Adivo Ads] Missing assets/resources/Adivo.local.json');
  const value = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const required = ['sdkKey', 'rewardedAdUnitId', 'bundleIdentifier', 'developmentTeam'];
  for (const key of required) {
    if (!value[key] || String(value[key]).startsWith('YOUR_')) throw new Error(`[Adivo Ads] Invalid local configuration field: ${key}`);
  }
  return value;
}

function chooseTarget(projectPath) {
  const raw = child.execFileSync('xcodebuild', ['-project', projectPath, '-list', '-json'], { encoding: 'utf8' });
  const json = JSON.parse(raw);
  const targets = (json.project && json.project.targets) || [];
  if (!targets.length) throw new Error('[Adivo Ads] Xcode project has no targets');
  return targets.find((name) => /-mobile$/i.test(name))
      || targets.find((name) => !/(cocos|engine|tests?|benchmark|library)/i.test(name))
      || targets[0];
}

function copyFrameworks(extensionRoot, xcodeRoot) {
  const source = path.join(extensionRoot, 'native/Frameworks');
  const destination = path.join(xcodeRoot, 'Adivo/Frameworks');
  fs.mkdirSync(destination, { recursive: true });
  const names = ['AdivoCore.xcframework', 'AdivoMAX.xcframework', 'AdivoAds.xcframework', 'AdivoCocosBridge.xcframework'];
  for (const name of names) {
    const from = path.join(source, name);
    const to = path.join(destination, name);
    if (!fs.existsSync(from)) throw new Error(`[Adivo Ads] Missing binary framework: ${name}`);
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
  }
}

function writePodFiles(xcodeRoot, target) {
  const podspec = `Pod::Spec.new do |s|\n  s.name = 'AdivoCocosBinary'\n  s.version = '0.1.0'\n  s.summary = 'Adivo Ads binary SDK for Cocos Creator iOS'\n  s.homepage = 'https://github.com/zhishusoft'\n  s.license = { :type => 'Proprietary' }\n  s.author = { 'Adivo Ads' => 'sdk@adivo.invalid' }\n  s.source = { :path => '.' }\n  s.platform = :ios, '15.0'\n  s.vendored_frameworks = 'Adivo/Frameworks/*.xcframework'\n  s.preserve_paths = 'Adivo/Frameworks/*.xcframework'\n  s.dependency 'AppLovinSDK', '= 13.6.4'\n  s.pod_target_xcconfig = { 'OTHER_LDFLAGS' => '$(inherited) -ObjC' }\nend\n`;
  fs.writeFileSync(path.join(xcodeRoot, 'AdivoCocosBinary.podspec'), podspec);
  const safeTarget = target.replace(/'/g, "\\'");
  const podfile = `platform :ios, '15.0'\ninstall! 'cocoapods', :deterministic_uuids => false\n\ntarget '${safeTarget}' do\n  pod 'AdivoCocosBinary', :path => '.'\nend\n\npost_install do |installer|\n  installer.pods_project.targets.each do |pod_target|\n    pod_target.build_configurations.each do |config|\n      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'\n    end\n  end\nend\n`;
  fs.writeFileSync(path.join(xcodeRoot, 'Podfile'), podfile);
}

function patchProject(projectPath, target, config) {
  const script = `require 'xcodeproj'\nproject = Xcodeproj::Project.open(ARGV[0])\ntarget_name, bundle_id, team_id = ARGV[1], ARGV[2], ARGV[3]\nzero_check = project.targets.find { |item| item.name == 'ZERO_CHECK' }\nproject.targets.each do |item|\n  item.dependencies.to_a.each do |dependency|\n    dependency.remove_from_project if zero_check && dependency.target == zero_check\n  end\n  item.build_configurations.each do |build|\n    build.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'\n    build.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'\n    cflags = Array(build.build_settings['OTHER_CFLAGS']).flat_map { |value| value.to_s.split(/\\s+/) }.map { |value| value.gsub(/^['\"]+|['\"]+$/, '') }\n    cxxflags = cflags.reject { |value| value == '-std=gnu99' || value == '$(inherited)' || value.empty? }\n    cxxflags << '-Wno-invalid-specialization' unless cxxflags.include?('-Wno-invalid-specialization')\n    build.build_settings['OTHER_CPLUSPLUSFLAGS'] = cxxflags\n  end\nend\napp = project.targets.find { |item| item.name == target_name }\nraise \"target not found: #{target_name}\" unless app\napp.build_configurations.each do |build|\n  build.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = bundle_id\n  build.build_settings['DEVELOPMENT_TEAM'] = team_id\n  build.build_settings['CODE_SIGN_STYLE'] = 'Automatic'\n  ldflags = Array(build.build_settings['OTHER_LDFLAGS'])\n  ldflags << '-ObjC' unless ldflags.include?('-ObjC')\n  build.build_settings['OTHER_LDFLAGS'] = ldflags\nend\nproject.save\n`;
  const scriptPath = path.join(path.dirname(projectPath), '.adivo-patch.rb');
  fs.writeFileSync(scriptPath, script);
  child.execFileSync('ruby', [scriptPath, projectPath, target, config.bundleIdentifier, config.developmentTeam], { stdio: 'inherit' });
  fs.rmSync(scriptPath, { force: true });
}

function patchLegacyWebP(projectPath, xcodeRoot) {
  const pbxproj = path.join(projectPath, 'project.pbxproj');
  const contents = fs.readFileSync(pbxproj, 'utf8');
  const matches = contents.match(/\/[^\s;"']*\/libwebp\.a/g) || [];
  const source = [...new Set(matches)].find((candidate) => fs.existsSync(candidate));
  if (!source) return;

  const destination = path.join(xcodeRoot, 'Adivo/Compat/libwebp-xcode27.a');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  // Some legacy Cocos archives contain slices without a symbol table. On newer
  // lipo versions `-archs` prints a misleading "empty archive" error for those
  // slices, while `-info` still reports the universal binary correctly.
  const info = child.execFileSync('lipo', ['-info', source], { encoding: 'utf8' });
  const knownArchitectures = ['i386', 'armv7', 'armv7s', 'x86_64', 'arm64'];
  const architectures = knownArchitectures.filter((architecture) => new RegExp(`(^|\\s)${architecture}(?=\\s|$)`).test(info));
  if (!architectures.length) throw new Error('[Adivo Ads] Could not identify libwebp architectures');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'adivo-webp.'));
  try {
    const repackedSlices = [];
    for (const architecture of architectures) {
      const sliceRoot = path.join(tempRoot, architecture);
      fs.mkdirSync(sliceRoot);
      const sourceSlice = path.join(sliceRoot, 'source.a');
      child.execFileSync('lipo', [source, '-thin', architecture, '-output', sourceSlice]);
      child.execFileSync('ar', ['-x', sourceSlice], { cwd: sliceRoot });
      fs.rmSync(sourceSlice);
      const objects = fs.readdirSync(sliceRoot)
        .filter((name) => name.endsWith('.o'))
        .sort()
        .map((name) => path.join(sliceRoot, name));
      if (!objects.length) throw new Error(`[Adivo Ads] Empty libwebp slice: ${architecture}`);
      const repacked = path.join(tempRoot, `${architecture}.a`);
      child.execFileSync('/usr/bin/libtool', ['-static', '-o', repacked, ...objects]);
      repackedSlices.push(repacked);
    }
    child.execFileSync('lipo', ['-create', ...repackedSlices, '-output', destination]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  fs.writeFileSync(pbxproj, contents.split(source).join(destination));
  console.log(`[Adivo Ads] Repacked legacy Cocos libwebp for the current Xcode linker (${architectures.join(', ')})`);
}

function patchSceneManifest(xcodeRoot, target) {
  const infoPlist = path.join(xcodeRoot, `CMakeFiles/${target}.dir/Info.plist`);
  if (!fs.existsSync(infoPlist)) throw new Error('[Adivo Ads] Generated iOS Info.plist was not found');
  const script = `import plistlib, sys\np=sys.argv[1]\nwith open(p, 'rb') as f: value=plistlib.load(f)\nvalue['UIApplicationSceneManifest']={'UIApplicationSupportsMultipleScenes': False, 'UISceneConfigurations': {'UIWindowSceneSessionRoleApplication': [{'UISceneConfigurationName': 'Default Configuration', 'UISceneClassName': 'UIWindowScene', 'UISceneDelegateClassName': 'SceneDelegate'}]}}\nwith open(p, 'wb') as f: plistlib.dump(value, f, fmt=plistlib.FMT_XML, sort_keys=False)\n`;
  child.execFileSync('python3', ['-c', script, infoPlist]);
}

function processIOS(roots, projectRoot) {
  const uniqueRoots = [...new Set(roots.filter(Boolean).map((root) => path.resolve(root)))];
  let projectPath = null;
  for (const root of uniqueRoots) {
    projectPath = walkForProject(root);
    if (projectPath) break;
  }
  if (!projectPath) return false;
  const xcodeRoot = path.dirname(projectPath);
  const marker = path.join(xcodeRoot, '.adivo-postprocessed');
  const config = readConfig(projectRoot);
  const extensionRoot = path.resolve(__dirname, '..');
  const target = chooseTarget(projectPath);
  copyFrameworks(extensionRoot, xcodeRoot);
  patchProject(projectPath, target, config);
  patchLegacyWebP(projectPath, xcodeRoot);
  patchSceneManifest(xcodeRoot, target);
  writePodFiles(xcodeRoot, target);
  child.execFileSync('pod', ['install', '--project-directory=' + xcodeRoot], { stdio: 'inherit' });
  fs.writeFileSync(marker, JSON.stringify({ target, appLovin: '13.6.4' }, null, 2));
  console.log(`[Adivo Ads] iOS postprocess complete: target=${target}, workspace=${path.basename(projectPath, '.xcodeproj')}.xcworkspace`);
  return true;
}

exports.processIOS = processIOS;
