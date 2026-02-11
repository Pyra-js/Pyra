// src/routes/error-test/page.tsx
import { jsxs } from "react/jsx-runtime";
async function load(ctx) {
  throw new Error("Intentional load error");
}
function ErrorTestPage({ data }) {
  return /* @__PURE__ */ jsxs("div", { children: [
    "This should not render: ",
    data
  ] });
}
export {
  ErrorTestPage as default,
  load
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3JvdXRlcy9lcnJvci10ZXN0L3BhZ2UudHN4Il0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgdHlwZSB7IFJlcXVlc3RDb250ZXh0IH0gZnJvbSAncHlyYWpzLXNoYXJlZCc7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9hZChjdHg6IFJlcXVlc3RDb250ZXh0KSB7XHJcbiAgdGhyb3cgbmV3IEVycm9yKCdJbnRlbnRpb25hbCBsb2FkIGVycm9yJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIEVycm9yVGVzdFBhZ2UoeyBkYXRhIH06IHsgZGF0YTogc3RyaW5nIH0pIHtcclxuICByZXR1cm4gPGRpdj5UaGlzIHNob3VsZCBub3QgcmVuZGVyOiB7ZGF0YX08L2Rpdj47XHJcbn1cclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQU9TO0FBTFQsZUFBc0IsS0FBSyxLQUFxQjtBQUM5QyxRQUFNLElBQUksTUFBTSx3QkFBd0I7QUFDMUM7QUFFZSxTQUFSLGNBQStCLEVBQUUsS0FBSyxHQUFxQjtBQUNoRSxTQUFPLHFCQUFDLFNBQUk7QUFBQTtBQUFBLElBQXlCO0FBQUEsS0FBSztBQUM1QzsiLAogICJuYW1lcyI6IFtdCn0K
