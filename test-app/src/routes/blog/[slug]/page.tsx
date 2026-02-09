export async function load(ctx: any) {
  return {
    title: `Post: ${ctx.params.slug}`,
    slug: ctx.params.slug,
    loadedAt: new Date().toISOString(),
  };
}

export default function BlogPost({
  title,
  slug,
  loadedAt,
  params,
}: {
  title: string;
  slug: string;
  loadedAt: string;
  params: { slug: string };
}) {
  return (
    <div>
      <h1>{title}</h1>
      <p>
        Slug: <strong>{slug}</strong>
      </p>
      <p>Loaded at: {loadedAt}</p>
      <a href="/">Back to Home</a>
    </div>
  );
}
