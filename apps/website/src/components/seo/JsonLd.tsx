export function JsonLd({ data }: { data: unknown }) {
  // Escape `<` so a field containing the literal `</script>` (e.g. an article
  // title authored in the CMS) can't break out of the script element and
  // inject markup. JSON.stringify alone does not do this.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
