#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 Cocos Creator iOS 与 Adivo Ads 原生 SDK 之间的 Objective-C 反射桥接。

 所有方法必须在主线程调用。异步结果会写入内部 JSON 消息队列，Cocos 侧应定期调用
 ``drainMessages`` 并在主线程分发。
 */
@interface AdivoCocosBridge : NSObject

/** 设置宿主当前是否具备广告请求资格。 */
+ (void)setCanRequestAds:(BOOL)allowed;

/**
 使用 JSON 配置初始化 Adivo Ads。

 @param json 包含业务广告位、MAX SDK Key 和可选隐私信号的 JSON 字符串。
 @param requestID 用于关联异步完成消息的请求标识。
 */
+ (void)initializeAds:(NSString *)json requestID:(NSString *)requestID;

/**
 为业务广告位加载广告。

 @param placement 业务广告位名称。
 @param requestID 用于关联异步完成消息的请求标识。
 */
+ (void)load:(NSString *)placement requestID:(NSString *)requestID;

/** 返回业务广告位当前是否有可展示的有效缓存广告。 */
+ (BOOL)isReady:(NSString *)placement;

/**
 展示业务广告位对应的缓存广告。

 展示完成消息仅表示广告关闭或失败；有效奖励通过独立的 ``rewardEarned`` 事件传递。

 @param placement 业务广告位名称。
 @param requestID 用于关联异步完成消息的请求标识。
 */
+ (void)show:(NSString *)placement requestID:(NSString *)requestID;

/** 通知 Adivo 宿主隐私状态已变化，并阻挡旧隐私状态下的缓存广告。 */
+ (void)privacyDidChange;

/** 在初始化成功后打开 MAX Mediation Debugger。 */
+ (void)showMediationDebugger;

/**
 取出并清空当前所有原生消息。

 @return JSON 数组字符串；队列为空时返回空数组。
 */
+ (NSString *)drainMessages;
@end

NS_ASSUME_NONNULL_END
