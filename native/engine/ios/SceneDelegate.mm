#import "SceneDelegate.h"

#import "AppDelegate.h"

@implementation SceneDelegate

- (AppDelegate *)applicationDelegate {
    return (AppDelegate *)UIApplication.sharedApplication.delegate;
}

- (void)scene:(UIScene *)scene
        willConnectToSession:(UISceneSession *)session
        options:(UISceneConnectionOptions *)connectionOptions {
    if (![scene isKindOfClass:[UIWindowScene class]]) return;
    AppDelegate *delegate = self.applicationDelegate;
    [delegate connectWindowScene:(UIWindowScene *)scene];
    self.window = delegate.window;
}

- (void)sceneDidBecomeActive:(UIScene *)scene {
    [self.applicationDelegate sceneDidBecomeActive];
}

- (void)sceneWillResignActive:(UIScene *)scene {
    [self.applicationDelegate sceneWillResignActive];
}

- (void)sceneWillEnterForeground:(UIScene *)scene {
    [self.applicationDelegate sceneWillEnterForeground];
}

- (void)sceneDidEnterBackground:(UIScene *)scene {
    [self.applicationDelegate sceneDidEnterBackground];
}

@end
