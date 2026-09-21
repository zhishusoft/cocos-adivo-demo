import { director, Director, native, sys } from 'cc';
import { NATIVE } from 'cc/env';

export type AdivoAdFormat = 'rewarded' | 'interstitial';

export interface AdivoPlacement {
    name: string;
    adUnitID: string;
    format: AdivoAdFormat;
    enabled?: boolean;
}

export interface AdivoConfiguration {
    placements: AdivoPlacement[];
    initializationTimeout?: number;
    loadTimeout?: number;
}

export interface AdivoMaxOptions {
    sdkKey: string;
    testMode?: boolean;
    hasUserConsent?: boolean;
    doNotSell?: boolean;
    verboseLogging?: boolean;
    testDeviceAdvertisingIdentifiers?: string[];
}

export interface AdivoPrivacyState {
    canRequestAds: boolean;
}

export interface AdivoReward {
    placement: string;
    sessionId: string;
    amount: string;
    label: string;
}

export interface AdivoRevenue {
    placement: string;
    sessionId: string;
    amount?: string;
    currency: string;
    precision: string;
    network: string;
}

export interface AdivoEvent {
    type: string;
    placement: string;
    sessionId: string;
    message?: string;
    errorCode?: string;
}

interface NativeMessage {
    messageType: 'completion' | 'event';
    requestId?: string;
    success?: boolean;
    errorCode?: string;
    message?: string;
    eventType?: string;
    placement?: string;
    sessionId?: string;
    rewardAmount?: string;
    rewardLabel?: string;
    hasRevenueAmount?: boolean;
    revenueAmount?: string;
    currency?: string;
    precision?: string;
    network?: string;
}

interface PendingRequest {
    resolve: () => void;
    reject: (error: AdivoError) => void;
}

interface PendingShow {
    placement: string;
    reward?: (reward: AdivoReward) => void;
}

export class AdivoError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message || code);
        this.name = 'AdivoError';
    }
}

export class AdivoAds {
    private static nextRequest = 1;
    private static pending = new Map<string, PendingRequest>();
    private static ready = new Set<string>();
    private static initialized = false;
    private static installed = false;
    private static editorShouldReward = true;
    private static pendingShow: PendingShow | null = null;
    private static rewardsBySession = new Map<string, ((reward: AdivoReward) => void) | undefined>();
    private static rewardedSessions = new Set<string>();
    private static eventListeners = new Set<(event: AdivoEvent) => void>();
    private static rewardListeners = new Set<(reward: AdivoReward) => void>();
    private static revenueListeners = new Set<(revenue: AdivoRevenue) => void>();

    static initialize(configuration: AdivoConfiguration, options: AdivoMaxOptions, privacy: AdivoPrivacyState): Promise<void> {
        this.validate(configuration, options);
        this.installPump();
        if (!this.isNativeIOS()) {
            this.initialized = true;
            return Promise.resolve();
        }
        this.callNative('setCanRequestAds:', privacy.canRequestAds);
        return this.request((requestID) => {
            const payload = JSON.stringify({
                ...configuration,
                sdkKey: options.sdkKey,
                testMode: options.testMode ?? false,
                hasUserConsent: options.hasUserConsent,
                doNotSell: options.doNotSell,
                verboseLogging: options.verboseLogging ?? false,
                testDeviceAdvertisingIdentifiers: options.testDeviceAdvertisingIdentifiers ?? [],
            });
            this.callNative('initializeAds:requestID:', payload, requestID);
        }).then(() => { this.initialized = true; });
    }

    static load(placement: string): Promise<void> {
        if (!this.initialized) return Promise.reject(new AdivoError('notInitialized', '请先初始化广告。'));
        if (!this.isNativeIOS()) {
            this.ready.add(placement);
            this.emitEvent({ type: 'loaded', placement, sessionId: '' });
            return Promise.resolve();
        }
        return this.request((requestID) => this.callNative('load:requestID:', placement, requestID));
    }

    static isReady(placement: string): boolean {
        if (!this.isNativeIOS()) return this.ready.has(placement);
        return Boolean(this.callNative('isReady:', placement));
    }

    static async show(placement: string, onReward?: (reward: AdivoReward) => void): Promise<void> {
        if (!this.initialized) throw new AdivoError('notInitialized', '请先初始化广告。');
        if (!this.isReady(placement)) throw new AdivoError('notReady', '广告尚未就绪。');
        this.pendingShow = { placement, reward: onReward };
        if (!this.isNativeIOS()) {
            this.ready.delete(placement);
            const sessionId = this.simulatedSession();
            this.bindSession(placement, sessionId);
            this.dispatch({ messageType: 'event', eventType: 'displayed', placement, sessionId });
            await new Promise((resolve) => setTimeout(resolve, 350));
            if (this.editorShouldReward) {
                this.dispatch({ messageType: 'event', eventType: 'rewardEarned', placement, sessionId, rewardAmount: '1', rewardLabel: 'reward' });
            }
            this.dispatch({ messageType: 'event', eventType: 'closed', placement, sessionId });
            this.pendingShow = null;
            return;
        }
        try {
            await this.request((requestID) => this.callNative('show:requestID:', placement, requestID));
        } finally {
            this.pendingShow = null;
        }
    }

    static privacyDidChange(): void {
        this.ready.clear();
        this.callNative('privacyDidChange');
    }

    static showMediationDebugger(): void {
        this.callNative('showMediationDebugger');
    }

    static setEditorRewardOutcome(value: boolean): void { this.editorShouldReward = value; }
    static onEvent(listener: (event: AdivoEvent) => void): () => void { this.eventListeners.add(listener); return () => this.eventListeners.delete(listener); }
    static onReward(listener: (reward: AdivoReward) => void): () => void { this.rewardListeners.add(listener); return () => this.rewardListeners.delete(listener); }
    static onRevenue(listener: (revenue: AdivoRevenue) => void): () => void { this.revenueListeners.add(listener); return () => this.revenueListeners.delete(listener); }

    static pump(): void {
        if (!this.isNativeIOS()) return;
        const json = this.callNative('drainMessages');
        if (!json || json === '[]') return;
        try {
            const messages = JSON.parse(String(json)) as NativeMessage[];
            for (const message of messages) this.dispatch(message);
        } catch (error) {
            console.error('[Adivo Ads] Invalid native message batch', error);
        }
    }

    private static installPump(): void {
        if (this.installed) return;
        this.installed = true;
        director.on(Director.EVENT_AFTER_UPDATE, this.pump, this);
    }

    private static request(invoke: (requestID: string) => void): Promise<void> {
        const requestID = String(this.nextRequest++);
        return new Promise<void>((resolve, reject) => {
            this.pending.set(requestID, { resolve, reject });
            try { invoke(requestID); }
            catch (error) {
                this.pending.delete(requestID);
                reject(new AdivoError('nativeBridge', String(error)));
            }
        });
    }

    private static dispatch(message: NativeMessage): void {
        if (message.messageType === 'completion') {
            const request = this.pending.get(message.requestId ?? '');
            if (!request) return;
            this.pending.delete(message.requestId ?? '');
            if (message.success) request.resolve();
            else request.reject(new AdivoError(message.errorCode || 'unknown', message.message || '广告操作失败。'));
            return;
        }
        const placement = message.placement ?? '';
        const sessionId = message.sessionId ?? '';
        if (sessionId) this.bindSession(placement, sessionId);
        this.emitEvent({ type: message.eventType ?? 'unknown', placement, sessionId, message: message.message, errorCode: message.errorCode });
        if (message.eventType === 'loaded') this.ready.add(placement);
        if (message.eventType === 'displayed') this.ready.delete(placement);
        if (message.eventType === 'rewardEarned' && sessionId && !this.rewardedSessions.has(sessionId)) {
            this.rewardedSessions.add(sessionId);
            const reward: AdivoReward = { placement, sessionId, amount: message.rewardAmount ?? '', label: message.rewardLabel ?? '' };
            this.rewardsBySession.get(sessionId)?.(reward);
            for (const listener of this.rewardListeners) listener(reward);
            this.trimSessions();
        }
        if (message.eventType === 'revenuePaid') {
            const revenue: AdivoRevenue = {
                placement, sessionId,
                amount: message.hasRevenueAmount ? message.revenueAmount : undefined,
                currency: message.currency ?? '', precision: message.precision ?? '', network: message.network ?? '',
            };
            for (const listener of this.revenueListeners) listener(revenue);
        }
    }

    private static bindSession(placement: string, sessionId: string): void {
        if (this.rewardsBySession.has(sessionId)) return;
        if (this.pendingShow?.placement === placement) this.rewardsBySession.set(sessionId, this.pendingShow.reward);
    }

    private static trimSessions(): void {
        while (this.rewardsBySession.size > 256) {
            const first = this.rewardsBySession.keys().next().value as string | undefined;
            if (!first) break;
            this.rewardsBySession.delete(first);
            this.rewardedSessions.delete(first);
        }
    }

    private static emitEvent(event: AdivoEvent): void {
        for (const listener of this.eventListeners) listener(event);
    }

    private static isNativeIOS(): boolean { return NATIVE && sys.os === sys.OS.IOS; }

    private static callNative(selector: string, ...args: unknown[]): any {
        if (!this.isNativeIOS()) return undefined;
        return (native.reflection.callStaticMethod as any)('AdivoCocosBridge', selector, ...args);
    }

    private static validate(configuration: AdivoConfiguration, options: AdivoMaxOptions): void {
        if (!options.sdkKey || options.sdkKey.startsWith('YOUR_')) throw new AdivoError('missingSDKKey', '缺少 MAX SDK Key。');
        if (!configuration.placements?.length) throw new AdivoError('missingPlacements', '至少配置一个广告位。');
        for (const placement of configuration.placements) {
            if (!placement.name || !placement.adUnitID || placement.adUnitID.startsWith('YOUR_')) {
                throw new AdivoError('invalidPlacement', `广告位 ${placement.name || '<empty>'} 配置无效。`);
            }
        }
    }

    private static simulatedSession(): string {
        return 'SIM-' + Date.now().toString(16).toUpperCase() + '-' + Math.random().toString(16).slice(2, 10).toUpperCase();
    }
}
