// src/routes/error-test/component/page.tsx
import { jsx } from "react/jsx-runtime";
function ComponentErrorPage() {
  throw new Error("Intentional component error");
  return /* @__PURE__ */ jsx("div", { children: "This should not render" });
}
export {
  ComponentErrorPage as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3JvdXRlcy9lcnJvci10ZXN0L2NvbXBvbmVudC9wYWdlLnRzeCJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gQ29tcG9uZW50RXJyb3JQYWdlKCkge1xyXG4gIHRocm93IG5ldyBFcnJvcignSW50ZW50aW9uYWwgY29tcG9uZW50IGVycm9yJyk7XHJcbiAgcmV0dXJuIDxkaXY+VGhpcyBzaG91bGQgbm90IHJlbmRlcjwvZGl2PjtcclxufVxyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBRVM7QUFGTSxTQUFSLHFCQUFzQztBQUMzQyxRQUFNLElBQUksTUFBTSw2QkFBNkI7QUFDN0MsU0FBTyxvQkFBQyxTQUFJLG9DQUFzQjtBQUNwQzsiLAogICJuYW1lcyI6IFtdCn0K
