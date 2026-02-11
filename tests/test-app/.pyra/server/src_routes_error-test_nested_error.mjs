// src/routes/error-test/nested/error.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function NestedErrorBoundary({ message, statusCode, pathname }) {
  return /* @__PURE__ */ jsxs("div", { className: "nested-error-boundary", children: [
    /* @__PURE__ */ jsxs("h1", { children: [
      "Nested Error ",
      statusCode
    ] }),
    /* @__PURE__ */ jsx("p", { className: "nested-error-message", children: message }),
    /* @__PURE__ */ jsxs("p", { className: "nested-error-path", children: [
      "Path: ",
      pathname
    ] })
  ] });
}
export {
  NestedErrorBoundary as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3JvdXRlcy9lcnJvci10ZXN0L25lc3RlZC9lcnJvci50c3giXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB0eXBlIHsgRXJyb3JQYWdlUHJvcHMgfSBmcm9tICdweXJhanMtc2hhcmVkJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIE5lc3RlZEVycm9yQm91bmRhcnkoeyBtZXNzYWdlLCBzdGF0dXNDb2RlLCBwYXRobmFtZSB9OiBFcnJvclBhZ2VQcm9wcykge1xyXG4gIHJldHVybiAoXHJcbiAgICA8ZGl2IGNsYXNzTmFtZT1cIm5lc3RlZC1lcnJvci1ib3VuZGFyeVwiPlxyXG4gICAgICA8aDE+TmVzdGVkIEVycm9yIHtzdGF0dXNDb2RlfTwvaDE+XHJcbiAgICAgIDxwIGNsYXNzTmFtZT1cIm5lc3RlZC1lcnJvci1tZXNzYWdlXCI+e21lc3NhZ2V9PC9wPlxyXG4gICAgICA8cCBjbGFzc05hbWU9XCJuZXN0ZWQtZXJyb3ItcGF0aFwiPlBhdGg6IHtwYXRobmFtZX08L3A+XHJcbiAgICA8L2Rpdj5cclxuICApO1xyXG59XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFLTSxTQUNBLEtBREE7QUFIUyxTQUFSLG9CQUFxQyxFQUFFLFNBQVMsWUFBWSxTQUFTLEdBQW1CO0FBQzdGLFNBQ0UscUJBQUMsU0FBSSxXQUFVLHlCQUNiO0FBQUEseUJBQUMsUUFBRztBQUFBO0FBQUEsTUFBYztBQUFBLE9BQVc7QUFBQSxJQUM3QixvQkFBQyxPQUFFLFdBQVUsd0JBQXdCLG1CQUFRO0FBQUEsSUFDN0MscUJBQUMsT0FBRSxXQUFVLHFCQUFvQjtBQUFBO0FBQUEsTUFBTztBQUFBLE9BQVM7QUFBQSxLQUNuRDtBQUVKOyIsCiAgIm5hbWVzIjogW10KfQo=
