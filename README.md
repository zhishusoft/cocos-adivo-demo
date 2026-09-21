# Adivo Ads Cocos Creator iOS Demo

这个 Demo 使用 Cocos Creator 3.8.8，原生 Adivo 实现只以静态 XCFramework 交付。宿主侧保留 TypeScript API、Cocos 构建扩展和必要的 iOS 生命周期兼容代码，便于审查接入行为；仓库不会提交 SDK Key、广告位、Bundle ID 或签名团队。

- Cocos Creator：`3.8.8`
- iOS：`15.0+`
- AppLovin MAX：`13.6.4`
- 原生 Adivo SDK：4 个静态 XCFramework，包含真机 arm64 与模拟器 arm64/x86_64

## 演示视频

<!-- GitHub 视频附件地址在首次发布后写入这里。 -->

[播放或下载 MP4 文件](docs/demo.mp4)

## 下载

```bash
git clone https://github.com/zhishusoft/cocos-adivo-demo.git
cd cocos-adivo-demo
```

## 环境

- Cocos Creator 3.8.8
- iOS 15+
- Xcode 26.2+；当前也兼容 Xcode 27
- CocoaPods

Demo 的基础依赖是 AppLovin MAX 13.6.4。Google、Meta、Pangle 和 ironSource 渠道需要按 Adivo 发行包说明额外添加对应 MAX 适配器；没有添加的渠道不会进入 App。

## 配置

复制示例配置：

```bash
cp assets/resources/Adivo.local.json.example assets/resources/Adivo.local.json
cp build-configs/ios.json build-configs/ios.local.json
```

在 `Adivo.local.json` 中填写自己的：

- `sdkKey`：MAX SDK Key
- `rewardedAdUnitId`：MAX 激励广告位
- `interstitialAdUnitId`：MAX 插屏广告位
- `bundleIdentifier`：App 的 Bundle ID
- `developmentTeam`：Apple Developer Team ID

开发阶段保持 `testMode: true`。`Adivo.local.json`、其 `.meta` 和 `ios.local.json` 已被 Git 忽略。

`canRequestAds` 只能在宿主完成适用的 CMP/ATT 流程并确认允许请求广告后设为 `true`。ATT 授权状态不等同于 GDPR/CCPA 同意；隐私状态变化后调用 `AdivoAds.privacyDidChange()`，旧广告会失效，需要重新初始化和加载。

## 在 Cocos Creator 中运行

1. 用 Cocos Creator 打开本目录。
2. Editor 或 Web 预览会运行明确标记的模拟广告，不访问真实广告网络。
3. 在构建面板选择 iOS，最低版本设为 15，点击构建。
4. 构建扩展会复制四个 XCFramework、添加 `-ObjC`、生成 Podfile，并执行 `pod install`。
5. 打开 `build/ios/proj/AdivoCocosDemo.xcworkspace`，选择签名团队和真机后运行。

不要打开 `.xcodeproj`，否则 CocoaPods 与 AppLovinSDK 不会进入最终 App。Xcode 27 下，扩展还会在生成目录重打包 Cocos 3.8.8 的旧 WebP 静态库；Cocos 安装目录不会被修改。

## TypeScript 调用

```ts
await AdivoAds.initialize(
  { placements: [
    { name: 'revive', adUnitID: rewardedId, format: 'rewarded' },
    { name: 'level_end', adUnitID: interstitialId, format: 'interstitial' },
  ] },
  { sdkKey, testMode: true },
  { canRequestAds: true },
);

await AdivoAds.load('revive');
await AdivoAds.show('revive', (reward) => {
  grantRewardOnce(reward.sessionId);
});
```

入口位于 `assets/adivo/AdivoAds.ts`。iOS 使用 `native.reflection` 调用 `AdivoCocosBridge`，原生异步事件写入 JSON 队列，再由 Cocos 主线程轮询和分发。

有效奖励按原生 session ID 去重。`closed` 只完成展示 Promise，不发奖励；广告关闭后迟到的有效奖励仍会交给本次展示绑定的回调。业务发奖仍应在服务端或本地持久层按 session ID 保持幂等。

## 页面与日志

页面提供初始化、激励加载/展示、插屏加载/展示和 Mediation Debugger。收入金额始终显示为“已隐藏”，session 只显示前 8 位，适合录屏演示。Editor 模式还提供“完成并奖励”和“直接关闭”两条模拟路径。

真机验收需要分别看到初始化、加载、展示、奖励、关闭和收入事件。构建、签名、安装或模拟广告成功都不能替代真实广告闭环。广告网络无填充、广告位禁用或账号配置失败时，Demo 会保留原始 SDK 错误。

四个 Adivo XCFramework 的逐切片 SHA-256 见 [BINARY-MANIFEST.json](BINARY-MANIFEST.json)。下载后可运行 `python3 scripts/verify-package.py` 验证二进制、占位配置和私密数据边界。
