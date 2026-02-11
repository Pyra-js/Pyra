// src/routes/error.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function ErrorBoundary({ message, statusCode, pathname, stack }) {
  return /* @__PURE__ */ jsxs("div", { className: "error-boundary", children: [
    /* @__PURE__ */ jsxs("h1", { children: [
      "Error ",
      statusCode
    ] }),
    /* @__PURE__ */ jsx("p", { className: "error-message", children: message }),
    /* @__PURE__ */ jsxs("p", { className: "error-path", children: [
      "Path: ",
      pathname
    ] }),
    stack && /* @__PURE__ */ jsx("pre", { className: "error-stack", children: stack })
  ] });
}
export {
  ErrorBoundary as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3JvdXRlcy9lcnJvci50c3giXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB0eXBlIHsgRXJyb3JQYWdlUHJvcHMgfSBmcm9tICdweXJhanMtc2hhcmVkJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIEVycm9yQm91bmRhcnkoeyBtZXNzYWdlLCBzdGF0dXNDb2RlLCBwYXRobmFtZSwgc3RhY2sgfTogRXJyb3JQYWdlUHJvcHMpIHtcclxuICByZXR1cm4gKFxyXG4gICAgPGRpdiBjbGFzc05hbWU9XCJlcnJvci1ib3VuZGFyeVwiPlxyXG4gICAgICA8aDE+RXJyb3Ige3N0YXR1c0NvZGV9PC9oMT5cclxuICAgICAgPHAgY2xhc3NOYW1lPVwiZXJyb3ItbWVzc2FnZVwiPnttZXNzYWdlfTwvcD5cclxuICAgICAgPHAgY2xhc3NOYW1lPVwiZXJyb3ItcGF0aFwiPlBhdGg6IHtwYXRobmFtZX08L3A+XHJcbiAgICAgIHtzdGFjayAmJiA8cHJlIGNsYXNzTmFtZT1cImVycm9yLXN0YWNrXCI+e3N0YWNrfTwvcHJlPn1cclxuICAgIDwvZGl2PlxyXG4gICk7XHJcbn1cclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUtNLFNBQ0EsS0FEQTtBQUhTLFNBQVIsY0FBK0IsRUFBRSxTQUFTLFlBQVksVUFBVSxNQUFNLEdBQW1CO0FBQzlGLFNBQ0UscUJBQUMsU0FBSSxXQUFVLGtCQUNiO0FBQUEseUJBQUMsUUFBRztBQUFBO0FBQUEsTUFBTztBQUFBLE9BQVc7QUFBQSxJQUN0QixvQkFBQyxPQUFFLFdBQVUsaUJBQWlCLG1CQUFRO0FBQUEsSUFDdEMscUJBQUMsT0FBRSxXQUFVLGNBQWE7QUFBQTtBQUFBLE1BQU87QUFBQSxPQUFTO0FBQUEsSUFDekMsU0FBUyxvQkFBQyxTQUFJLFdBQVUsZUFBZSxpQkFBTTtBQUFBLEtBQ2hEO0FBRUo7IiwKICAibmFtZXMiOiBbXQp9Cg==
