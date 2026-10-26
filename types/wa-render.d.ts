declare module '@/public/wa-render' {
  const wa: {
    OPTIONAL: Record<string, string[]>;
    render(key: string, template: string, vars: Record<string, unknown>): string;
  };
  export default wa;
}
