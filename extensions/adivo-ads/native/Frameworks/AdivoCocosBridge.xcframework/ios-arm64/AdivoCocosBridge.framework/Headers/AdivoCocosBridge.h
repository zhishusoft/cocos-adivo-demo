#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface AdivoCocosBridge : NSObject
+ (void)setCanRequestAds:(BOOL)allowed;
+ (void)initializeAds:(NSString *)json requestID:(NSString *)requestID;
+ (void)load:(NSString *)placement requestID:(NSString *)requestID;
+ (BOOL)isReady:(NSString *)placement;
+ (void)show:(NSString *)placement requestID:(NSString *)requestID;
+ (void)privacyDidChange;
+ (void)showMediationDebugger;
+ (NSString *)drainMessages;
@end

NS_ASSUME_NONNULL_END
