import { formatMoney } from '../utils/money'

export interface Product {
  id: string
  name: string
  slug: string
  weight: string
  weightLabel: string
  price: number
  priceFormatted: string
  description: string
  features: string[]
  nutrition: Record<string, string>
  ingredients: string
  howToUse: string
  inStock: boolean
}

export const products: Product[] = [
  {
    id: '1',
    name: 'Plant Protein Powder',
    slug: 'plant-protein-500g',
    weight: '500g',
    weightLabel: '500g',
    price: 89900,
    priceFormatted: formatMoney(89900),
    description:
      'Premium plant-based protein powder crafted for the active Chiang Mai community. A clean blend of pea and rice protein delivering 25g of complete protein per serving with no artificial sweeteners or fillers.',
    features: [
      '25g protein per serving',
      'Complete amino acid profile',
      'No artificial sweeteners',
      'Easily digestible',
    ],
    nutrition: {
      'Serving Size': '30g (1 scoop)',
      Calories: '120',
      Protein: '25g',
      Carbohydrates: '3g',
      Fat: '1.5g',
      Fiber: '2g',
      Sodium: '150mg',
    },
    ingredients:
      'Pea protein isolate, brown rice protein concentrate, natural vanilla flavoring, coconut MCT powder, sea salt, stevia leaf extract.',
    howToUse:
      'Mix one scoop (30g) with 250-300ml of cold water, plant milk, or your favorite smoothie. Shake or blend well. Best consumed within 30 minutes after training. Can also be added to oatmeal, pancakes, or baked goods.',
    inStock: true,
  },
  {
    id: '2',
    name: 'Plant Protein Powder',
    slug: 'plant-protein-1000g',
    weight: '1000g',
    weightLabel: '1kg',
    price: 159900,
    priceFormatted: formatMoney(159900),
    description:
      'Premium plant-based protein powder crafted for the active Chiang Mai community. A clean blend of pea and rice protein delivering 25g of complete protein per serving with no artificial sweeteners or fillers. The 1kg size is our best value for committed athletes.',
    features: [
      '25g protein per serving',
      'Complete amino acid profile',
      'No artificial sweeteners',
      'Best value — 33 servings',
    ],
    nutrition: {
      'Serving Size': '30g (1 scoop)',
      Calories: '120',
      Protein: '25g',
      Carbohydrates: '3g',
      Fat: '1.5g',
      Fiber: '2g',
      Sodium: '150mg',
    },
    ingredients:
      'Pea protein isolate, brown rice protein concentrate, natural vanilla flavoring, coconut MCT powder, sea salt, stevia leaf extract.',
    howToUse:
      'Mix one scoop (30g) with 250-300ml of cold water, plant milk, or your favorite smoothie. Shake or blend well. Best consumed within 30 minutes after training. Can also be added to oatmeal, pancakes, or baked goods.',
    inStock: true,
  },
]

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug)
}
