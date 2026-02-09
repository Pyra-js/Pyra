// src/routes/old-page/page.tsx
import { jsx } from "react/jsx-runtime";
function load(ctx) {
  return ctx.redirect("/about");
}
function OldPage() {
  return /* @__PURE__ */ jsx("div", { children: "You should not see this" });
}
export {
  OldPage as default,
  load
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3JvdXRlcy9vbGQtcGFnZS9wYWdlLnRzeCJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IGZ1bmN0aW9uIGxvYWQoY3R4OiBhbnkpIHtcclxuICByZXR1cm4gY3R4LnJlZGlyZWN0KFwiL2Fib3V0XCIpO1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBPbGRQYWdlKCkge1xyXG4gIHJldHVybiA8ZGl2PllvdSBzaG91bGQgbm90IHNlZSB0aGlzPC9kaXY+O1xyXG59XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFLUztBQUxGLFNBQVMsS0FBSyxLQUFVO0FBQzdCLFNBQU8sSUFBSSxTQUFTLFFBQVE7QUFDOUI7QUFFZSxTQUFSLFVBQTJCO0FBQ2hDLFNBQU8sb0JBQUMsU0FBSSxxQ0FBdUI7QUFDckM7IiwKICAibmFtZXMiOiBbXQp9Cg==
