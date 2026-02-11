export default function ComponentErrorPage() {
  throw new Error('Intentional component error');
  return <div>This should not render</div>;
}
