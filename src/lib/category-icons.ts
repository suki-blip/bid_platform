// SVG icon paths for trade categories — returns inline SVG string
const categoryIcons: Record<string, string> = {
  // Structure
  'general-construction': '🏗️',
  'concrete': '🧱',
  'structural-steel': '🔩',
  'masonry': '🧱',
  'carpentry': '🪚',
  'roofing': '🏠',
  'waterproofing': '💧',
  // MEP
  'plumbing': '🔧',
  'hvac': '❄️',
  'electrical': '⚡',
  'fire-protection': '🔥',
  'low-voltage': '📡',
  'elevator': '🛗',
  // Finishes
  'painting': '🎨',
  'flooring': '🟫',
  'tile': '🔲',
  'drywall': '📐',
  'millwork': '🪵',
  'glass---glazing': '🪟',
  'doors---hardware': '🚪',
  'kitchen-equipment': '🍳',
  // Site
  'demolition': '💥',
  'excavation': '⛏️',
  'landscaping': '🌿',
  'paving': '🛣️',
};

const groupIcons: Record<string, string> = {
  'Structure': '🏗️',
  'MEP': '⚡',
  'Finishes': '🎨',
  'Site': '⛏️',
  'Other': '📦',
};

export function getCategoryIcon(categoryId: string): string {
  return categoryIcons[categoryId] || '📋';
}

export function getGroupIcon(groupName: string): string {
  return groupIcons[groupName] || '📦';
}
