// src/routes/error-test/nested/page.tsx
import { jsxs } from "react/jsx-runtime";
async function load(ctx) {
  throw new Error("Nested load error");
}
function NestedErrorPage({ data }) {
  return /* @__PURE__ */ jsxs("div", { children: [
    "This should not render: ",
    data
  ] });
}
export {
  NestedErrorPage as default,
  load
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3JvdXRlcy9lcnJvci10ZXN0L25lc3RlZC9wYWdlLnRzeCJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHR5cGUgeyBSZXF1ZXN0Q29udGV4dCB9IGZyb20gJ3B5cmFqcy1zaGFyZWQnO1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvYWQoY3R4OiBSZXF1ZXN0Q29udGV4dCkge1xyXG4gIHRocm93IG5ldyBFcnJvcignTmVzdGVkIGxvYWQgZXJyb3InKTtcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gTmVzdGVkRXJyb3JQYWdlKHsgZGF0YSB9OiB7IGRhdGE6IHN0cmluZyB9KSB7XHJcbiAgcmV0dXJuIDxkaXY+VGhpcyBzaG91bGQgbm90IHJlbmRlcjoge2RhdGF9PC9kaXY+O1xyXG59XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFPUztBQUxULGVBQXNCLEtBQUssS0FBcUI7QUFDOUMsUUFBTSxJQUFJLE1BQU0sbUJBQW1CO0FBQ3JDO0FBRWUsU0FBUixnQkFBaUMsRUFBRSxLQUFLLEdBQXFCO0FBQ2xFLFNBQU8scUJBQUMsU0FBSTtBQUFBO0FBQUEsSUFBeUI7QUFBQSxLQUFLO0FBQzVDOyIsCiAgIm5hbWVzIjogW10KfQo=
