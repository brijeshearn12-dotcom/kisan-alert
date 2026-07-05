declare module '@svg-maps/india' {
  export interface Region {
    name: string;
    id: string;
    path: string;
  }
  export interface SVGMap {
    label: string;
    viewBox: string;
    locations: Region[];
  }
  const India: SVGMap;
  export default India;
}
