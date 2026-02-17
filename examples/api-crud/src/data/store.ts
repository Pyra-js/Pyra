export interface Item {
  id: number;
  name: string;
  value: number;
  createdAt: string;
}

let nextId = 4;

const items: Item[] = [
  { id: 1, name: 'Alpha', value: 100, createdAt: new Date().toISOString() },
  { id: 2, name: 'Beta', value: 200, createdAt: new Date().toISOString() },
  { id: 3, name: 'Gamma', value: 300, createdAt: new Date().toISOString() },
];

export function getItems(): Item[] {
  return items;
}

export function getItemById(id: number): Item | undefined {
  return items.find((i) => i.id === id);
}

export function createItem(data: { name: string; value: number }): Item {
  const item: Item = {
    id: nextId++,
    name: data.name,
    value: data.value,
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  return item;
}

export function updateItem(id: number, data: Partial<{ name: string; value: number }>): Item | null {
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  if (data.name !== undefined) item.name = data.name;
  if (data.value !== undefined) item.value = data.value;
  return item;
}

export function deleteItem(id: number): boolean {
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  items.splice(idx, 1);
  return true;
}
