declare module "zipcodes" {
  export type ZipCode = {
    zip: string
    latitude: number
    longitude: number
    city: string
    state: string
    country: string
  }
  export const codes: Record<string, ZipCode>
  export function lookupByName(city: string, state: string): ZipCode[]
}
