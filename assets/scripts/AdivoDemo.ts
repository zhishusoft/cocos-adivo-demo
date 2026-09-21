import {
    _decorator, Button, Color, Component, Graphics, JsonAsset, Label, Node,
    resources, screen, sys, UITransform, Vec3, view, Widget,
} from 'cc';
import { NATIVE } from 'cc/env';
import {
    AdivoAds, AdivoConfiguration, AdivoError, AdivoMaxOptions,
    AdivoPrivacyState, AdivoReward,
} from '../adivo/AdivoAds';

const { ccclass } = _decorator;

interface DemoConfiguration {
    sdkKey: string;
    rewardedAdUnitId: string;
    interstitialAdUnitId: string;
    testMode: boolean;
    canRequestAds: boolean;
    hasUserConsent?: boolean;
    doNotSell?: boolean;
    verboseLogging?: boolean;
    testDeviceAdvertisingIdentifiers?: string[];
    bundleIdentifier?: string;
    developmentTeam?: string;
}

@ccclass('AdivoDemo')
export class AdivoDemo extends Component {
    private settings: DemoConfiguration | null = null;
    private status: Label | null = null;
    private rewards: Label | null = null;
    private rewardCount = 0;
    private logs: string[] = [];
    private disposers: Array<() => void> = [];

    start(): void {
        this.buildInterface();
        this.disposers.push(AdivoAds.onEvent((event) => this.append(`事件 ${event.type} placement=${event.placement} session=${this.shortSession(event.sessionId)}`)));
        this.disposers.push(AdivoAds.onReward((reward) => this.append(`奖励事件 session=${this.shortSession(reward.sessionId)} ${reward.amount} ${reward.label}`)));
        this.disposers.push(AdivoAds.onRevenue((revenue) => this.append(`收入 [已隐藏] ${revenue.currency} / ${revenue.network}`)));
        this.append(this.isNativeIOS() ? 'iOS MAX 模式' : 'Editor 模拟模式');
        resources.load('Adivo.local', JsonAsset, (error, asset) => {
            if (error || !asset) {
                if (!this.isNativeIOS()) {
                    this.settings = {
                        sdkKey: 'EDITOR_SIMULATION', rewardedAdUnitId: 'SIMULATED_REWARDED',
                        interstitialAdUnitId: 'SIMULATED_INTERSTITIAL', testMode: true, canRequestAds: true,
                    };
                    this.append('使用 Editor 模拟配置');
                } else {
                    this.append('配置失败：缺少 resources/Adivo.local.json');
                }
                return;
            }
            this.settings = asset.json as DemoConfiguration;
            this.append('本地配置已加载');
        });
    }

    onDestroy(): void {
        for (const dispose of this.disposers) dispose();
        this.disposers.length = 0;
    }

    private async initializeAds(): Promise<void> {
        await this.run('初始化', async () => {
            const settings = this.requireSettings();
            const configuration: AdivoConfiguration = { placements: [
                { name: 'revive', adUnitID: settings.rewardedAdUnitId, format: 'rewarded' },
                { name: 'level_end', adUnitID: settings.interstitialAdUnitId, format: 'interstitial' },
            ] };
            const options: AdivoMaxOptions = {
                sdkKey: settings.sdkKey, testMode: settings.testMode,
                hasUserConsent: settings.hasUserConsent, doNotSell: settings.doNotSell,
                verboseLogging: settings.verboseLogging,
                testDeviceAdvertisingIdentifiers: settings.testDeviceAdvertisingIdentifiers ?? [],
            };
            const privacy: AdivoPrivacyState = { canRequestAds: settings.canRequestAds };
            await AdivoAds.initialize(configuration, options, privacy);
        });
    }

    private loadRewarded(): void { void this.run('加载激励', () => AdivoAds.load('revive')); }
    private loadInterstitial(): void { void this.run('加载插屏', () => AdivoAds.load('level_end')); }

    private showRewarded(editorShouldReward: boolean): void {
        AdivoAds.setEditorRewardOutcome(editorShouldReward);
        void this.run('展示激励', () => AdivoAds.show('revive', (reward) => this.didEarnReward(reward)));
    }

    private showInterstitial(): void { void this.run('展示插屏', () => AdivoAds.show('level_end')); }

    private didEarnReward(reward: AdivoReward): void {
        this.rewardCount += 1;
        if (this.rewards) this.rewards.string = `有效奖励：${this.rewardCount} 次`;
        this.append(`业务发奖成功 session=${this.shortSession(reward.sessionId)}`);
    }

    private async run(name: string, operation: () => Promise<void>): Promise<void> {
        this.append(`${name}开始`);
        try {
            await operation();
            this.append(`${name}完成`);
        } catch (error) {
            if (error instanceof AdivoError) this.append(`${name}失败 [${error.code}] ${error.message}`);
            else this.append(`${name}失败 ${String(error)}`);
        }
    }

    private requireSettings(): DemoConfiguration {
        if (!this.settings) throw new AdivoError('missingConfiguration', '本地配置尚未加载。');
        return this.settings;
    }

    private buildInterface(): void {
        const canvas = this.node;
        const root = new Node('SafeArea');
        canvas.addChild(root);
        root.layer = canvas.layer;
        root.addComponent(UITransform).setContentSize(1106, 2300);
        const widget = root.addComponent(Widget);
        widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
        widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        this.applySafeArea(widget);

        const background = root.addComponent(Graphics);
        background.fillColor = new Color(15, 20, 31, 255);
        background.rect(-553, -1150, 1106, 2300);
        background.fill();

        this.makeLabel(root, 'Adivo Ads · Cocos iOS Demo', 44, 70, 1080, true);
        this.rewards = this.makeLabel(root, '有效奖励：0 次', 32, 52, 1000, true);
        this.makeButton(root, '初始化', 900, () => void this.initializeAds());
        this.makeButton(root, '加载激励', 796, () => this.loadRewarded());
        this.makeButton(root, this.isNativeIOS() ? '展示激励' : '模拟：完成并奖励', 692, () => this.showRewarded(true));
        let nextY = 588;
        if (!this.isNativeIOS()) {
            this.makeButton(root, '模拟：直接关闭', nextY, () => this.showRewarded(false));
            nextY -= 104;
        }
        this.makeButton(root, '加载插屏', nextY, () => this.loadInterstitial()); nextY -= 104;
        this.makeButton(root, '展示插屏', nextY, () => this.showInterstitial()); nextY -= 104;
        this.makeButton(root, '打开 Mediation Debugger', nextY, () => AdivoAds.showMediationDebugger());
        this.status = this.makeLabel(root, '', 23, 930, -320, false);
        this.status.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.status.verticalAlign = Label.VerticalAlign.TOP;
        this.status.overflow = Label.Overflow.CLAMP;
    }

    private makeButton(parent: Node, title: string, y: number, action: () => void): void {
        const node = new Node(title);
        parent.addChild(node);
        node.layer = parent.layer;
        node.setPosition(new Vec3(0, y));
        node.addComponent(UITransform).setContentSize(1040, 86);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = new Color(31, 102, 230, 255);
        graphics.roundRect(-520, -43, 1040, 86, 4);
        graphics.fill();
        node.addComponent(Button);
        this.makeLabel(node, title, 27, 86, 0, true);
        node.on(Button.EventType.CLICK, () => {
            this.append(`点击 ${title}`);
            action();
        });
    }

    private makeLabel(parent: Node, text: string, size: number, height: number, y: number, bold: boolean): Label {
        const node = new Node('Text');
        parent.addChild(node);
        node.layer = parent.layer;
        node.setPosition(new Vec3(0, y));
        node.addComponent(UITransform).setContentSize(1040, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = Math.round(size * 1.25);
        label.color = Color.WHITE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.isBold = bold;
        return label;
    }

    private applySafeArea(widget: Widget): void {
        const window = screen.windowSize;
        const safe = screen.safeArea;
        const visible = view.getVisibleSize();
        const scaleX = window.width > 0 ? visible.width / window.width : 1;
        const scaleY = window.height > 0 ? visible.height / window.height : 1;
        const xMin = safe?.xMin ?? 0;
        const xMax = safe?.xMax ?? window.width;
        const yMin = safe?.yMin ?? 0;
        const yMax = safe?.yMax ?? window.height;
        widget.left = xMin * scaleX + 32;
        widget.right = (window.width - xMax) * scaleX + 32;
        widget.bottom = yMin * scaleY + 32;
        widget.top = (window.height - yMax) * scaleY + 32;
    }

    private append(message: string): void {
        console.log(`[Adivo Demo] ${message}`);
        const now = new Date();
        const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map((value) => String(value).padStart(2, '0')).join(':');
        this.logs.push(`${time} ${message}`);
        if (this.logs.length > 30) this.logs.splice(0, this.logs.length - 30);
        if (this.status) this.status.string = this.logs.join('\n');
    }

    private shortSession(value: string): string { return value ? value.slice(0, 8) : ''; }
    private isNativeIOS(): boolean { return NATIVE && sys.os === sys.OS.IOS; }
}
