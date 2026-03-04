import { useState, useEffect } from "react";

export interface Location {
  pathname: string;
  search: string;
  hash: string;
  searchParams: URLSearchParams;
}

function getLocation(): Location {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    searchParams: new URLSearchParams(window.location.search),
  };
}

/**
 * Returns the current URL location and re-renders when it changes.
 * Updates on both `<Link>` navigations and browser Back/Forward.
 */
export function useLocation(): Location {
  const [location, setLocation] = useState(getLocation);

  useEffect(() => {
    const handler = () => setLocation(getLocation());
    window.addEventListener("popstate", handler);
    window.addEventListener("pyra:navigate", handler);
    return () => {
      window.removeEventListener("popstate", handler);
      window.removeEventListener("pyra:navigate", handler);
    };
  }, []);

  return location;
}
