import type { Router, RouteRecordRaw } from 'vue-router';

import { usePermissionStoreWithOut } from '/@/store/modules/permission';

import { PageEnum } from '/@/enums/pageEnum';
import { useUserStoreWithOut } from '/@/store/modules/user';

import { PAGE_NOT_FOUND_ROUTE } from '/@/router/routes/basic';

import { RootRoute } from '/@/router/routes';

const LOGIN_PATH = PageEnum.BASE_LOGIN;

const ROOT_PATH = RootRoute.path;

const whitePathList: PageEnum[] = [LOGIN_PATH];

export function createPermissionGuard(router: Router) {
  const userStore = useUserStoreWithOut();
  const permissionStore = usePermissionStoreWithOut();
  
  router.beforeEach(async (to, from, next) => {
    if (
      from.path === ROOT_PATH && // /
      to.path === PageEnum.BASE_HOME && // /dashboard
      userStore.getUserInfo.homePath &&
      userStore.getUserInfo.homePath !== PageEnum.BASE_HOME
    ) {
      next(userStore.getUserInfo.homePath);
      return;
    }

    const token = userStore.getToken;

    // 白名单可以直接进入
    if (whitePathList.includes(to.path as PageEnum)) {
      // 要去登录页
      if (to.path === LOGIN_PATH && token) {
        // 登录是否过期
        const isSessionTimeout = userStore.getSessionTimeout;

        try {
          await userStore.afterLoginAction();
          
          // 没有过期不能去登录页
          if (!isSessionTimeout) {
            next((to.query?.redirect as string) || '/');
            return;
          }

        } catch {}
      }

      next();

      return;
    }

    // token 不存在
    if (!token) {
      // You can access without permission. You need to set the routing meta.ignoreAuth to true
      // 路由配置 可以直接访问的页面
      if (to.meta.ignoreAuth) {
        next();
        return;
      }

      // 重定向到登录页
      const redirectData: { path: string; replace: boolean; query?: Recordable<string> } = {
        path: LOGIN_PATH,
        replace: true,
      };

      if (to.path) {
        redirectData.query = {
          ...redirectData.query,
          redirect: to.path,
        };
      }

      next(redirectData);

      return;
    }

    // Jump to the 404 page after processing the login
    // 处理完登录后跳转到404页面
    if (
      from.path === LOGIN_PATH &&
      to.name === PAGE_NOT_FOUND_ROUTE.name &&
      to.fullPath !== (userStore.getUserInfo.homePath || PageEnum.BASE_HOME)
    ) {
      next(userStore.getUserInfo.homePath || PageEnum.BASE_HOME);
      return
    }

    // get userinfo while last fetch time is empty
    // 当上次获取时间为空时获取用户信息
    if (userStore.getLastUpdateTime === 0) {
      try {
        await userStore.getUserInfoAction();
      } catch (err) {
        next();
        return;
      }
    }

    if (permissionStore.getIsDynamicAddedRoute) {
      next();
      return;
    }

    // 生成用户的路由表
    const routes = await permissionStore.buildRoutesAction();

    routes.forEach((route) => {
      router.addRoute(route as unknown as RouteRecordRaw);
    });

    router.addRoute(PAGE_NOT_FOUND_ROUTE as unknown as RouteRecordRaw);

    permissionStore.setDynamicAddedRoute(true);

    if (to.name === PAGE_NOT_FOUND_ROUTE.name) {
      // 动态添加路由后，此处应当重定向到fullPath，否则会加载404页面内容
      next({ path: to.fullPath, replace: true, query: to.query });
    } else {
      const redirectPath = (from.query.redirect || to.path) as string;
      const redirect = decodeURIComponent(redirectPath);
      const nextData = to.path === redirect ? { ...to, replace: true } : { path: redirect };
      next(nextData);
    }
  });
}
