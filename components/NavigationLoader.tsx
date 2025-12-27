"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "./LoadingSpinner";

interface NavigationLoaderProps {
  children: React.ReactNode;
}

export function NavigationLoader({ children }: NavigationLoaderProps) {
  const [isNavigating, setIsNavigating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handleRouteChangeStart = () => {
      setIsNavigating(true);
    };

    const handleRouteChangeComplete = () => {
      setIsNavigating(false);
    };

    // Listen for navigation events
    const originalPush = router.push;
    const originalReplace = router.replace;
    const originalBack = router.back;

    router.push = (...args) => {
      handleRouteChangeStart();
      originalPush.apply(router, args);
      setTimeout(handleRouteChangeComplete, 300);
    };

    router.replace = (...args) => {
      handleRouteChangeStart();
      originalReplace.apply(router, args);
      setTimeout(handleRouteChangeComplete, 300);
    };

    router.back = () => {
      handleRouteChangeStart();
      originalBack.apply(router);
      setTimeout(handleRouteChangeComplete, 300);
    };

    // Cleanup
    return () => {
      router.push = originalPush;
      router.replace = originalReplace;
      router.back = originalBack;
    };
  }, [router]);

  if (isNavigating) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8 border border-gray-200">
          <LoadingSpinner size="lg" text="Loading page..." />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// Alternative approach using a hook
export function useNavigationLoading() {
  const [isLoading, setIsLoading] = useState(false);

  const navigateWithLoading = (url: string, replace = false) => {
    setIsLoading(true);

    if (replace) {
      window.location.replace(url);
    } else {
      window.location.href = url;
    }

    // Reset loading state after navigation
    setTimeout(() => setIsLoading(false), 1000);
  };

  return {
    isLoading,
    navigateWithLoading,
    setIsLoading,
  };
}
