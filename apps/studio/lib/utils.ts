import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, letting later Tailwind utilities win over earlier ones.
 *
 * Plain string concatenation puts both `p-2` and `p-6` in the class list and
 * lets source order in the generated stylesheet decide — which is why every
 * component that accepts a `className` override needs this rather than a
 * template literal.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
