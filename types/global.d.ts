// Global ambient module declarations not covered by Next's built-in types.

declare module "*.css" {
  const content: { [className: string]: string };
  export default content;
}