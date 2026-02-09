export function load(ctx: any) {
  return ctx.redirect("/about");
}

export default function OldPage() {
  return <div>You should not see this</div>;
}
