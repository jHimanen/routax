export type UserId = string & { readonly __brand: "UserId" };

export interface UserContext {
  id: UserId;
  email: string;
}
