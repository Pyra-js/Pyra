// src/routes/blog/[slug]/page.tsx
import { jsx, jsxs } from "react/jsx-runtime";
async function load(ctx) {
  return {
    title: `Post: ${ctx.params.slug}`,
    slug: ctx.params.slug,
    loadedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function BlogPost({
  title,
  slug,
  loadedAt,
  params
}) {
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("h1", { children: title }),
    /* @__PURE__ */ jsxs("p", { children: [
      "Slug: ",
      /* @__PURE__ */ jsx("strong", { children: slug })
    ] }),
    /* @__PURE__ */ jsxs("p", { children: [
      "Loaded at: ",
      loadedAt
    ] }),
    /* @__PURE__ */ jsx("a", { href: "/", children: "Back to Home" })
  ] });
}
export {
  BlogPost as default,
  load
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3JvdXRlcy9ibG9nL1tzbHVnXS9wYWdlLnRzeCJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvYWQoY3R4OiBhbnkpIHtcclxuICByZXR1cm4ge1xyXG4gICAgdGl0bGU6IGBQb3N0OiAke2N0eC5wYXJhbXMuc2x1Z31gLFxyXG4gICAgc2x1ZzogY3R4LnBhcmFtcy5zbHVnLFxyXG4gICAgbG9hZGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBCbG9nUG9zdCh7XHJcbiAgdGl0bGUsXHJcbiAgc2x1ZyxcclxuICBsb2FkZWRBdCxcclxuICBwYXJhbXMsXHJcbn06IHtcclxuICB0aXRsZTogc3RyaW5nO1xyXG4gIHNsdWc6IHN0cmluZztcclxuICBsb2FkZWRBdDogc3RyaW5nO1xyXG4gIHBhcmFtczogeyBzbHVnOiBzdHJpbmcgfTtcclxufSkge1xyXG4gIHJldHVybiAoXHJcbiAgICA8ZGl2PlxyXG4gICAgICA8aDE+e3RpdGxlfTwvaDE+XHJcbiAgICAgIDxwPlxyXG4gICAgICAgIFNsdWc6IDxzdHJvbmc+e3NsdWd9PC9zdHJvbmc+XHJcbiAgICAgIDwvcD5cclxuICAgICAgPHA+TG9hZGVkIGF0OiB7bG9hZGVkQXR9PC9wPlxyXG4gICAgICA8YSBocmVmPVwiL1wiPkJhY2sgdG8gSG9tZTwvYT5cclxuICAgIDwvZGl2PlxyXG4gICk7XHJcbn1cclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQXFCTSxjQUNBLFlBREE7QUFyQk4sZUFBc0IsS0FBSyxLQUFVO0FBQ25DLFNBQU87QUFBQSxJQUNMLE9BQU8sU0FBUyxJQUFJLE9BQU8sSUFBSTtBQUFBLElBQy9CLE1BQU0sSUFBSSxPQUFPO0FBQUEsSUFDakIsV0FBVSxvQkFBSSxLQUFLLEdBQUUsWUFBWTtBQUFBLEVBQ25DO0FBQ0Y7QUFFZSxTQUFSLFNBQTBCO0FBQUEsRUFDL0I7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFDRixHQUtHO0FBQ0QsU0FDRSxxQkFBQyxTQUNDO0FBQUEsd0JBQUMsUUFBSSxpQkFBTTtBQUFBLElBQ1gscUJBQUMsT0FBRTtBQUFBO0FBQUEsTUFDSyxvQkFBQyxZQUFRLGdCQUFLO0FBQUEsT0FDdEI7QUFBQSxJQUNBLHFCQUFDLE9BQUU7QUFBQTtBQUFBLE1BQVk7QUFBQSxPQUFTO0FBQUEsSUFDeEIsb0JBQUMsT0FBRSxNQUFLLEtBQUksMEJBQVk7QUFBQSxLQUMxQjtBQUVKOyIsCiAgIm5hbWVzIjogW10KfQo=
