#import <UIKit/UIKit.h>
#import <objc/runtime.h>

static UIInterfaceOrientation AdivoCocosStatusBarOrientation(id self, SEL selector) {
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if (![scene isKindOfClass:[UIWindowScene class]]) continue;
        UIInterfaceOrientation orientation = ((UIWindowScene *)scene).interfaceOrientation;
        if (orientation != UIInterfaceOrientationUnknown) return orientation;
    }
    return UIInterfaceOrientationPortrait;
}

__attribute__((constructor))
static void InstallAdivoCocosOrientationCompatibility(void) {
    Method method = class_getInstanceMethod([UIApplication class], @selector(statusBarOrientation));
    if (method) method_setImplementation(method, (IMP)AdivoCocosStatusBarOrientation);
}
