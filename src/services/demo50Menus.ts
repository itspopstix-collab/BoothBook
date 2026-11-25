import { FlavorRecipe } from '../types';

const DEMO_50_RAW: Array<{ name: string; category: string; price: number; unit: string }> = [
  // Ice Cream (10)
  { name: 'Vanilla Madagascar', category: 'Ice Cream', price: 79, unit: 'สกู๊ป' },
  { name: 'Dark Chocolate 70%', category: 'Ice Cream', price: 89, unit: 'สกู๊ป' },
  { name: 'Matcha Uji Ceremonial', category: 'Ice Cream', price: 99, unit: 'สกู๊ป' },
  { name: 'Strawberry Cheesecake', category: 'Ice Cream', price: 89, unit: 'สกู๊ป' },
  { name: 'Salted Caramel', category: 'Ice Cream', price: 89, unit: 'สกู๊ป' },
  { name: 'Cookies & Cream', category: 'Ice Cream', price: 79, unit: 'สกู๊ป' },
  { name: 'Pistachio Bronte', category: 'Ice Cream', price: 109, unit: 'สกู๊ป' },
  { name: 'Yuzu Sorbet', category: 'Ice Cream', price: 89, unit: 'สกู๊ป' },
  { name: 'Mint Choc Chip', category: 'Ice Cream', price: 79, unit: 'สกู๊ป' },
  { name: 'Biscoff Crunch', category: 'Ice Cream', price: 99, unit: 'สกู๊ป' },

  // กาแฟ (10)
  { name: 'Iced Latte', category: 'กาแฟ', price: 75, unit: 'แก้ว' },
  { name: 'Cappuccino', category: 'กาแฟ', price: 75, unit: 'แก้ว' },
  { name: 'Caramel Macchiato', category: 'กาแฟ', price: 85, unit: 'แก้ว' },
  { name: 'Mocha Iced', category: 'กาแฟ', price: 80, unit: 'แก้ว' },
  { name: 'Dirty Coffee', category: 'กาแฟ', price: 95, unit: 'แก้ว' },
  { name: 'Orange Black Coffee', category: 'กาแฟ', price: 85, unit: 'แก้ว' },
  { name: 'Coconut Americano', category: 'กาแฟ', price: 85, unit: 'แก้ว' },
  { name: 'Es-Yen Thai Style', category: 'กาแฟ', price: 70, unit: 'แก้ว' },
  { name: 'Espresso Shot', category: 'กาแฟ', price: 60, unit: 'แก้ว' },
  { name: 'Honey Lemon Espresso', category: 'กาแฟ', price: 85, unit: 'แก้ว' },

  // ชา & นม (10)
  { name: 'Thai Milk Tea', category: 'ชา & นม', price: 65, unit: 'แก้ว' },
  { name: 'Matcha Latte', category: 'ชา & นม', price: 85, unit: 'แก้ว' },
  { name: 'Hojicha Latte', category: 'ชา & นม', price: 85, unit: 'แก้ว' },
  { name: 'Taiwan Milk Tea', category: 'ชา & นม', price: 70, unit: 'แก้ว' },
  { name: 'Brown Sugar Fresh Milk', category: 'ชา & นม', price: 80, unit: 'แก้ว' },
  { name: 'Pink Milk Nom Yen', category: 'ชา & นม', price: 60, unit: 'แก้ว' },
  { name: 'Dark Cocoa Milk', category: 'ชา & นม', price: 75, unit: 'แก้ว' },
  { name: 'Peach Tea Iced', category: 'ชา & นม', price: 65, unit: 'แก้ว' },
  { name: 'Lemon Black Tea', category: 'ชา & นม', price: 65, unit: 'แก้ว' },
  { name: 'Oolong Honey Tea', category: 'ชา & นม', price: 70, unit: 'แก้ว' },

  // โซดา & ผลไม้ (10)
  { name: 'Yuzu Honey Soda', category: 'โซดา & ผลไม้', price: 75, unit: 'แก้ว' },
  { name: 'Strawberry Soda', category: 'โซดา & ผลไม้', price: 65, unit: 'แก้ว' },
  { name: 'Lychee Rose Soda', category: 'โซดา & ผลไม้', price: 70, unit: 'แก้ว' },
  { name: 'Passion Fruit Soda', category: 'โซดา & ผลไม้', price: 70, unit: 'แก้ว' },
  { name: 'Blue Hawaii Soda', category: 'โซดา & ผลไม้', price: 65, unit: 'แก้ว' },
  { name: 'Peach Fizz Soda', category: 'โซดา & ผลไม้', price: 70, unit: 'แก้ว' },
  { name: 'Red Plum Lemon Soda', category: 'โซดา & ผลไม้', price: 65, unit: 'แก้ว' },
  { name: 'Mango Passion Smoothie', category: 'โซดา & ผลไม้', price: 85, unit: 'แก้ว' },
  { name: 'Mixed Berry Smoothie', category: 'โซดา & ผลไม้', price: 85, unit: 'แก้ว' },
  { name: 'Watermelon Mint Cooler', category: 'โซดา & ผลไม้', price: 70, unit: 'แก้ว' },

  // เบเกอรี่ & ขนม (10)
  { name: 'Butter Croissant', category: 'เบเกอรี่ & ขนม', price: 75, unit: 'ชิ้น' },
  { name: 'Pain au Chocolat', category: 'เบเกอรี่ & ขนม', price: 85, unit: 'ชิ้น' },
  { name: 'Almond Croissant', category: 'เบเกอรี่ & ขนม', price: 95, unit: 'ชิ้น' },
  { name: 'Basque Burnt Cheesecake', category: 'เบเกอรี่ & ขนม', price: 115, unit: 'ชิ้น' },
  { name: 'Fudge Brownie', category: 'เบเกอรี่ & ขนม', price: 65, unit: 'ชิ้น' },
  { name: 'Soft Cookie Choc Chip', category: 'เบเกอรี่ & ขนม', price: 59, unit: 'ชิ้น' },
  { name: 'Matcha Soft Cookie', category: 'เบเกอรี่ & ขนม', price: 65, unit: 'ชิ้น' },
  { name: 'Honey Toast Mini', category: 'เบเกอรี่ & ขนม', price: 129, unit: 'ชุด' },
  { name: 'Banoffee Pie Cup', category: 'เบเกอรี่ & ขนม', price: 89, unit: 'ถ้วย' },
  { name: 'Belgian Waffle', category: 'เบเกอรี่ & ขนม', price: 69, unit: 'ชิ้น' },
];

export function buildDemo50Recipes(): FlavorRecipe[] {
  const baseTs = Date.now();
  return DEMO_50_RAW.map((item, idx) => ({
    id: `rec-demo50-${baseTs}-${idx}`,
    name: item.name,
    category: item.category,
    sellingPrice: item.price,
    unitLabel: item.unit,
    mode: 'per_cup',
    batchYieldCups: 1,
    halfScoopRatio: 0.5,
    ingredients: [],
  }));
}
