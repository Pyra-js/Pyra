// src/routes/dashboard/page.tsx
import { jsx, jsxs } from "react/jsx-runtime";
async function load(ctx) {
  return {
    method: ctx.request.method,
    pathname: ctx.url.pathname,
    hasHeaders: ctx.headers instanceof Headers,
    userAgent: ctx.headers.get("user-agent") || "unknown",
    mode: ctx.mode,
    routeId: ctx.routeId,
    hasCookies: typeof ctx.cookies.get === "function",
    hasEnv: typeof ctx.env === "object",
    hasJsonHelper: typeof ctx.json === "function",
    hasRedirectHelper: typeof ctx.redirect === "function"
  };
}
function Dashboard(props) {
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("h1", { children: "Dashboard" }),
    /* @__PURE__ */ jsxs("ul", { children: [
      /* @__PURE__ */ jsxs("li", { "data-field": "method", children: [
        "Method: ",
        props.method
      ] }),
      /* @__PURE__ */ jsxs("li", { "data-field": "pathname", children: [
        "Path: ",
        props.pathname
      ] }),
      /* @__PURE__ */ jsxs("li", { "data-field": "hasHeaders", children: [
        "Headers: ",
        String(props.hasHeaders)
      ] }),
      /* @__PURE__ */ jsxs("li", { "data-field": "userAgent", children: [
        "UA: ",
        props.userAgent
      ] }),
      /* @__PURE__ */ jsxs("li", { "data-field": "mode", children: [
        "Mode: ",
        props.mode
      ] }),
      /* @__PURE__ */ jsxs("li", { "data-field": "routeId", children: [
        "Route: ",
        props.routeId
      ] }),
      /* @__PURE__ */ jsxs("li", { "data-field": "hasCookies", children: [
        "Cookies: ",
        String(props.hasCookies)
      ] }),
      /* @__PURE__ */ jsxs("li", { "data-field": "hasEnv", children: [
        "Env: ",
        String(props.hasEnv)
      ] }),
      /* @__PURE__ */ jsxs("li", { "data-field": "hasJsonHelper", children: [
        "json(): ",
        String(props.hasJsonHelper)
      ] }),
      /* @__PURE__ */ jsxs("li", { "data-field": "hasRedirectHelper", children: [
        "redirect(): ",
        String(props.hasRedirectHelper)
      ] })
    ] })
  ] });
}
export {
  Dashboard as default,
  load
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3JvdXRlcy9kYXNoYm9hcmQvcGFnZS50c3giXSwKICAic291cmNlc0NvbnRlbnQiOiBbImV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkKGN0eDogYW55KSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIG1ldGhvZDogY3R4LnJlcXVlc3QubWV0aG9kLFxyXG4gICAgcGF0aG5hbWU6IGN0eC51cmwucGF0aG5hbWUsXHJcbiAgICBoYXNIZWFkZXJzOiBjdHguaGVhZGVycyBpbnN0YW5jZW9mIEhlYWRlcnMsXHJcbiAgICB1c2VyQWdlbnQ6IGN0eC5oZWFkZXJzLmdldChcInVzZXItYWdlbnRcIikgfHwgXCJ1bmtub3duXCIsXHJcbiAgICBtb2RlOiBjdHgubW9kZSxcclxuICAgIHJvdXRlSWQ6IGN0eC5yb3V0ZUlkLFxyXG4gICAgaGFzQ29va2llczogdHlwZW9mIGN0eC5jb29raWVzLmdldCA9PT0gXCJmdW5jdGlvblwiLFxyXG4gICAgaGFzRW52OiB0eXBlb2YgY3R4LmVudiA9PT0gXCJvYmplY3RcIixcclxuICAgIGhhc0pzb25IZWxwZXI6IHR5cGVvZiBjdHguanNvbiA9PT0gXCJmdW5jdGlvblwiLFxyXG4gICAgaGFzUmVkaXJlY3RIZWxwZXI6IHR5cGVvZiBjdHgucmVkaXJlY3QgPT09IFwiZnVuY3Rpb25cIixcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBEYXNoYm9hcmQocHJvcHM6IGFueSkge1xyXG4gIHJldHVybiAoXHJcbiAgICA8ZGl2PlxyXG4gICAgICA8aDE+RGFzaGJvYXJkPC9oMT5cclxuICAgICAgPHVsPlxyXG4gICAgICAgIDxsaSBkYXRhLWZpZWxkPVwibWV0aG9kXCI+TWV0aG9kOiB7cHJvcHMubWV0aG9kfTwvbGk+XHJcbiAgICAgICAgPGxpIGRhdGEtZmllbGQ9XCJwYXRobmFtZVwiPlBhdGg6IHtwcm9wcy5wYXRobmFtZX08L2xpPlxyXG4gICAgICAgIDxsaSBkYXRhLWZpZWxkPVwiaGFzSGVhZGVyc1wiPkhlYWRlcnM6IHtTdHJpbmcocHJvcHMuaGFzSGVhZGVycyl9PC9saT5cclxuICAgICAgICA8bGkgZGF0YS1maWVsZD1cInVzZXJBZ2VudFwiPlVBOiB7cHJvcHMudXNlckFnZW50fTwvbGk+XHJcbiAgICAgICAgPGxpIGRhdGEtZmllbGQ9XCJtb2RlXCI+TW9kZToge3Byb3BzLm1vZGV9PC9saT5cclxuICAgICAgICA8bGkgZGF0YS1maWVsZD1cInJvdXRlSWRcIj5Sb3V0ZToge3Byb3BzLnJvdXRlSWR9PC9saT5cclxuICAgICAgICA8bGkgZGF0YS1maWVsZD1cImhhc0Nvb2tpZXNcIj5Db29raWVzOiB7U3RyaW5nKHByb3BzLmhhc0Nvb2tpZXMpfTwvbGk+XHJcbiAgICAgICAgPGxpIGRhdGEtZmllbGQ9XCJoYXNFbnZcIj5FbnY6IHtTdHJpbmcocHJvcHMuaGFzRW52KX08L2xpPlxyXG4gICAgICAgIDxsaSBkYXRhLWZpZWxkPVwiaGFzSnNvbkhlbHBlclwiPmpzb24oKToge1N0cmluZyhwcm9wcy5oYXNKc29uSGVscGVyKX08L2xpPlxyXG4gICAgICAgIDxsaSBkYXRhLWZpZWxkPVwiaGFzUmVkaXJlY3RIZWxwZXJcIj5yZWRpcmVjdCgpOiB7U3RyaW5nKHByb3BzLmhhc1JlZGlyZWN0SGVscGVyKX08L2xpPlxyXG4gICAgICA8L3VsPlxyXG4gICAgPC9kaXY+XHJcbiAgKTtcclxufVxyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBa0JNLGNBRUUsWUFGRjtBQWxCTixlQUFzQixLQUFLLEtBQVU7QUFDbkMsU0FBTztBQUFBLElBQ0wsUUFBUSxJQUFJLFFBQVE7QUFBQSxJQUNwQixVQUFVLElBQUksSUFBSTtBQUFBLElBQ2xCLFlBQVksSUFBSSxtQkFBbUI7QUFBQSxJQUNuQyxXQUFXLElBQUksUUFBUSxJQUFJLFlBQVksS0FBSztBQUFBLElBQzVDLE1BQU0sSUFBSTtBQUFBLElBQ1YsU0FBUyxJQUFJO0FBQUEsSUFDYixZQUFZLE9BQU8sSUFBSSxRQUFRLFFBQVE7QUFBQSxJQUN2QyxRQUFRLE9BQU8sSUFBSSxRQUFRO0FBQUEsSUFDM0IsZUFBZSxPQUFPLElBQUksU0FBUztBQUFBLElBQ25DLG1CQUFtQixPQUFPLElBQUksYUFBYTtBQUFBLEVBQzdDO0FBQ0Y7QUFFZSxTQUFSLFVBQTJCLE9BQVk7QUFDNUMsU0FDRSxxQkFBQyxTQUNDO0FBQUEsd0JBQUMsUUFBRyx1QkFBUztBQUFBLElBQ2IscUJBQUMsUUFDQztBQUFBLDJCQUFDLFFBQUcsY0FBVyxVQUFTO0FBQUE7QUFBQSxRQUFTLE1BQU07QUFBQSxTQUFPO0FBQUEsTUFDOUMscUJBQUMsUUFBRyxjQUFXLFlBQVc7QUFBQTtBQUFBLFFBQU8sTUFBTTtBQUFBLFNBQVM7QUFBQSxNQUNoRCxxQkFBQyxRQUFHLGNBQVcsY0FBYTtBQUFBO0FBQUEsUUFBVSxPQUFPLE1BQU0sVUFBVTtBQUFBLFNBQUU7QUFBQSxNQUMvRCxxQkFBQyxRQUFHLGNBQVcsYUFBWTtBQUFBO0FBQUEsUUFBSyxNQUFNO0FBQUEsU0FBVTtBQUFBLE1BQ2hELHFCQUFDLFFBQUcsY0FBVyxRQUFPO0FBQUE7QUFBQSxRQUFPLE1BQU07QUFBQSxTQUFLO0FBQUEsTUFDeEMscUJBQUMsUUFBRyxjQUFXLFdBQVU7QUFBQTtBQUFBLFFBQVEsTUFBTTtBQUFBLFNBQVE7QUFBQSxNQUMvQyxxQkFBQyxRQUFHLGNBQVcsY0FBYTtBQUFBO0FBQUEsUUFBVSxPQUFPLE1BQU0sVUFBVTtBQUFBLFNBQUU7QUFBQSxNQUMvRCxxQkFBQyxRQUFHLGNBQVcsVUFBUztBQUFBO0FBQUEsUUFBTSxPQUFPLE1BQU0sTUFBTTtBQUFBLFNBQUU7QUFBQSxNQUNuRCxxQkFBQyxRQUFHLGNBQVcsaUJBQWdCO0FBQUE7QUFBQSxRQUFTLE9BQU8sTUFBTSxhQUFhO0FBQUEsU0FBRTtBQUFBLE1BQ3BFLHFCQUFDLFFBQUcsY0FBVyxxQkFBb0I7QUFBQTtBQUFBLFFBQWEsT0FBTyxNQUFNLGlCQUFpQjtBQUFBLFNBQUU7QUFBQSxPQUNsRjtBQUFBLEtBQ0Y7QUFFSjsiLAogICJuYW1lcyI6IFtdCn0K
