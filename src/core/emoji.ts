/**
 * Emoji picker data — a curated, keyword-searchable set bundled locally.
 * No network: every emoji here ships with the extension.
 */

export interface EmojiEntry {
  emoji: string;
  name: string;
  keywords: string;
}

export const EMOJI_GROUPS: Array<{ id: string; label: string; items: EmojiEntry[] }> = [
  {
    id: "smileys",
    label: "Smileys & emotions",
    items: [
      { emoji: "😀", name: "Grinning face", keywords: "happy smile laugh" },
      { emoji: "😄", name: "Grinning with smiling eyes", keywords: "happy smile" },
      { emoji: "😂", name: "Face with tears of joy", keywords: "laugh funny lol" },
      { emoji: "🥲", name: "Smiling with tear", keywords: "sad happy cry" },
      { emoji: "😊", name: "Smiling with smiling eyes", keywords: "happy blush" },
      { emoji: "😉", name: "Winking face", keywords: "wink joke" },
      { emoji: "😍", name: "Heart eyes", keywords: "love crush" },
      { emoji: "😘", name: "Face blowing a kiss", keywords: "love kiss" },
      { emoji: "😎", name: "Smiling with sunglasses", keywords: "cool" },
      { emoji: "🤔", name: "Thinking face", keywords: "think consider" },
      { emoji: "🤨", name: "Raising eyebrow", keywords: "suspicious doubt" },
      { emoji: "😐", name: "Neutral face", keywords: "meh" },
      { emoji: "😴", name: "Sleeping face", keywords: "tired sleep" },
      { emoji: "😭", name: "Loudly crying", keywords: "cry sad" },
      { emoji: "😤", name: "Steaming face", keywords: "angry frustrated" },
      { emoji: "😡", name: "Angry face", keywords: "mad" },
      { emoji: "🥳", name: "Partying face", keywords: "party celebrate" },
      { emoji: "🤯", name: "Exploding head", keywords: "mind blown shock" },
      { emoji: "🤗", name: "Hugging face", keywords: "hug warm" },
      { emoji: "🤫", name: "Shushing face", keywords: "quiet secret" },
      { emoji: "🤥", name: "Lying face", keywords: "liar pinocchio" },
      { emoji: "😇", name: "Smiling halo", keywords: "angel innocent" },
      { emoji: "🙃", name: "Upside-down face", keywords: "sarcasm silly" },
      { emoji: "🫡", name: "Saluting face", keywords: "respect salute" },
      { emoji: "🤝", name: "Handshake", keywords: "deal agree" }
    ]
  },
  {
    id: "people",
    label: "People & gestures",
    items: [
      { emoji: "👍", name: "Thumbs up", keywords: "like yes good" },
      { emoji: "👎", name: "Thumbs down", keywords: "dislike no bad" },
      { emoji: "👏", name: "Clapping hands", keywords: "applause congrats" },
      { emoji: "🙏", name: "Folded hands", keywords: "please thanks pray" },
      { emoji: "💪", name: "Flexed biceps", keywords: "strength strong gym" },
      { emoji: "👋", name: "Waving hand", keywords: "hello goodbye hi" },
      { emoji: "✌️", name: "Victory hand", keywords: "peace two" },
      { emoji: "🤞", name: "Crossed fingers", keywords: "luck hope" },
      { emoji: "🤟", name: "Love-you gesture", keywords: "love rock" },
      { emoji: "👌", name: "OK hand", keywords: "ok perfect" },
      { emoji: "🖐️", name: "Raised hand", keywords: "stop high five" },
      { emoji: "🙌", name: "Raising hands", keywords: "celebrate hooray" },
      { emoji: "🧠", name: "Brain", keywords: "smart mind" },
      { emoji: "👀", name: "Eyes", keywords: "watch look see" },
      { emoji: "🗣️", name: "Speaking head", keywords: "talk speak" },
      { emoji: "💃", name: "Dancing woman", keywords: "dance party" }
    ]
  },
  {
    id: "animals",
    label: "Animals & nature",
    items: [
      { emoji: "🐶", name: "Dog face", keywords: "dog puppy" },
      { emoji: "🐱", name: "Cat face", keywords: "cat kitten" },
      { emoji: "🐭", name: "Mouse face", keywords: "mouse" },
      { emoji: "🐹", name: "Hamster face", keywords: "hamster" },
      { emoji: "🐰", name: "Rabbit face", keywords: "rabbit bunny" },
      { emoji: "🦊", name: "Fox face", keywords: "fox" },
      { emoji: "🐻", name: "Bear face", keywords: "bear" },
      { emoji: "🐼", name: "Panda face", keywords: "panda" },
      { emoji: "🐨", name: "Koala", keywords: "koala" },
      { emoji: "🦁", name: "Lion face", keywords: "lion" },
      { emoji: "🐮", name: "Cow face", keywords: "cow" },
      { emoji: "🐷", name: "Pig face", keywords: "pig" },
      { emoji: "🐸", name: "Frog face", keywords: "frog" },
      { emoji: "🐵", name: "Monkey face", keywords: "monkey" },
      { emoji: "🐔", name: "Chicken", keywords: "chicken" },
      { emoji: "🐧", name: "Penguin", keywords: "penguin" },
      { emoji: "🦉", name: "Owl", keywords: "owl wise" },
      { emoji: "🦋", name: "Butterfly", keywords: "butterfly" },
      { emoji: "🐝", name: "Honeybee", keywords: "bee" },
      { emoji: "🌻", name: "Sunflower", keywords: "sunflower flower" },
      { emoji: "🌵", name: "Cactus", keywords: "cactus" },
      { emoji: "🍀", name: "Four leaf clover", keywords: "lucky clover" },
      { emoji: "🌙", name: "Crescent moon", keywords: "moon night" },
      { emoji: "⭐", name: "Star", keywords: "star rating" },
      { emoji: "☀️", name: "Sun", keywords: "sunny weather" }
    ]
  },
  {
    id: "food",
    label: "Food & drink",
    items: [
      { emoji: "🍎", name: "Red apple", keywords: "apple fruit" },
      { emoji: "🍌", name: "Banana", keywords: "banana" },
      { emoji: "🍕", name: "Pizza", keywords: "pizza" },
      { emoji: "🍔", name: "Hamburger", keywords: "burger" },
      { emoji: "🍟", name: "French fries", keywords: "fries chips" },
      { emoji: "🌮", name: "Taco", keywords: "taco" },
      { emoji: "🍣", name: "Sushi", keywords: "sushi" },
      { emoji: "🍜", name: "Noodles", keywords: "noodles ramen" },
      { emoji: "🍰", name: "Cake slice", keywords: "cake dessert" },
      { emoji: "🍦", name: "Ice cream", keywords: "ice cream" },
      { emoji: "🍫", name: "Chocolate bar", keywords: "chocolate" },
      { emoji: "☕", name: "Coffee", keywords: "coffee tea" },
      { emoji: "🍵", name: "Teacup", keywords: "tea green" },
      { emoji: "🍺", name: "Beer mug", keywords: "beer" },
      { emoji: "🥂", name: "Champagne glasses", keywords: "cheers toast" }
    ]
  },
  {
    id: "travel",
    label: "Travel & places",
    items: [
      { emoji: "🚗", name: "Car", keywords: "car drive" },
      { emoji: "🚕", name: "Taxi", keywords: "taxi cab" },
      { emoji: "🚀", name: "Rocket", keywords: "launch space fast" },
      { emoji: "✈️", name: "Airplane", keywords: "plane flight" },
      { emoji: "🏠", name: "House", keywords: "home house" },
      { emoji: "🏢", name: "Office building", keywords: "office work" },
      { emoji: "🏖️", name: "Beach", keywords: "beach holiday" },
      { emoji: "🏔️", name: "Mountain", keywords: "mountain" },
      { emoji: "🌍", name: "Globe Europe-Africa", keywords: "world earth global" },
      { emoji: "🗺️", name: "Map", keywords: "map directions" },
      { emoji: "📍", name: "Pin", keywords: "location place" },
      { emoji: "🚦", name: "Traffic light", keywords: "traffic" },
      { emoji: "🛒", name: "Shopping cart", keywords: "shop buy cart" },
      { emoji: "💼", name: "Briefcase", keywords: "work business" }
    ]
  },
  {
    id: "activities",
    label: "Activities & sports",
    items: [
      { emoji: "⚽", name: "Football", keywords: "soccer ball" },
      { emoji: "🏀", name: "Basketball", keywords: "basketball" },
      { emoji: "🎾", name: "Tennis", keywords: "tennis" },
      { emoji: "🏋️", name: "Weight lifter", keywords: "gym lift" },
      { emoji: "🚴", name: "Cyclist", keywords: "bike cycling" },
      { emoji: "🎮", name: "Video game", keywords: "game gaming" },
      { emoji: "🎧", name: "Headphone", keywords: "music listen" },
      { emoji: "🎵", name: "Music note", keywords: "music song" },
      { emoji: "🎸", name: "Guitar", keywords: "guitar music" },
      { emoji: "🎨", name: "Palette", keywords: "art paint" },
      { emoji: "🎬", name: "Clapper board", keywords: "film movie" },
      { emoji: "📚", name: "Books", keywords: "read book study" },
      { emoji: "✏️", name: "Pencil", keywords: "write edit" },
      { emoji: "🎉", name: "Party popper", keywords: "party celebrate" },
      { emoji: "🎁", name: "Gift", keywords: "present gift" }
    ]
  },
  {
    id: "objects",
    label: "Objects & tech",
    items: [
      { emoji: "💻", name: "Laptop", keywords: "computer laptop" },
      { emoji: "📱", name: "Mobile phone", keywords: "phone mobile" },
      { emoji: "⌚", name: "Watch", keywords: "watch time" },
      { emoji: "📷", name: "Camera", keywords: "camera photo" },
      { emoji: "🔒", name: "Lock", keywords: "lock secure privacy" },
      { emoji: "🔑", name: "Key", keywords: "key password" },
      { emoji: "💡", name: "Light bulb", keywords: "idea light" },
      { emoji: "🔧", name: "Wrench", keywords: "tool fix" },
      { emoji: "📌", name: "Pushpin", keywords: "pin note" },
      { emoji: "📎", name: "Paperclip", keywords: "clip attach" },
      { emoji: "📁", name: "Folder", keywords: "folder file" },
      { emoji: "📄", name: "Document", keywords: "document file" },
      { emoji: "📊", name: "Chart", keywords: "stats data chart" },
      { emoji: "🧮", name: "Abacus", keywords: "count math" },
      { emoji: "⚙️", name: "Gear", keywords: "settings gear" },
      { emoji: "🔋", name: "Battery", keywords: "battery power" },
      { emoji: "💾", name: "Floppy disk", keywords: "save disk" },
      { emoji: "🖨️", name: "Printer", keywords: "print" },
      { emoji: "📞", name: "Telephone", keywords: "phone call" },
      { emoji: "✉️", name: "Envelope", keywords: "email mail" }
    ]
  },
  {
    id: "symbols",
    label: "Symbols & flags",
    items: [
      { emoji: "❤️", name: "Red heart", keywords: "love heart" },
      { emoji: "🧡", name: "Orange heart", keywords: "love" },
      { emoji: "💛", name: "Yellow heart", keywords: "love" },
      { emoji: "💚", name: "Green heart", keywords: "love" },
      { emoji: "💙", name: "Blue heart", keywords: "love" },
      { emoji: "💜", name: "Purple heart", keywords: "love" },
      { emoji: "🖤", name: "Black heart", keywords: "love" },
      { emoji: "💔", name: "Broken heart", keywords: "heartbreak sad" },
      { emoji: "✅", name: "Check mark button", keywords: "done yes complete" },
      { emoji: "❌", name: "Cross mark", keywords: "no wrong cancel" },
      { emoji: "⚠️", name: "Warning", keywords: "warning caution" },
      { emoji: "🚨", name: "Police light", keywords: "alert alarm" },
      { emoji: "💯", name: "Hundred points", keywords: "perfect 100" },
      { emoji: "🔥", name: "Fire", keywords: "hot fire lit" },
      { emoji: "✨", name: "Sparkles", keywords: "shiny magic" },
      { emoji: "🎯", name: "Direct hit", keywords: "target goal" },
      { emoji: "🕐", name: "One o'clock", keywords: "time clock" },
      { emoji: "🏁", name: "Checkered flag", keywords: "finish race" }
    ]
  }
];

/** Case-insensitive search across names + keywords. */
export function searchEmoji(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return EMOJI_GROUPS.flatMap((g) => g.items);
  return EMOJI_GROUPS.flatMap((g) =>
    g.items.filter(
      (e) => e.name.toLowerCase().includes(q) || e.keywords.toLowerCase().includes(q)
    )
  );
}

export function emojiCount(): number {
  return EMOJI_GROUPS.reduce((n, g) => n + g.items.length, 0);
}
