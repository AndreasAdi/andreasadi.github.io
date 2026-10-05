// The Omarchy themes, as omarchy.org dresses itself in them. Each one is
// [background, surface, border, text, muted, brand, brand ink, and the
// three field shades the pixel wordmark is lit with: dim, mid, lit].
// Dark themes first, then light, so `T` walks from one family to the other.
export const themes = {
  "tokyo-night": ["#1a1b26", "#1f2230", "#414868", "#c0caf5", "#8b93b8", "#9ece6a", "#0c0e10", "#39482e", "#678549", "#9ece6a"],
  catppuccin: ["#1e1e2e", "#282839", "#585b70", "#cdd6f4", "#9399b2", "#89b4fa", "#0c0e10", "#34415c", "#5b76a4", "#89b4fa"],
  gruvbox: ["#282828", "#32302f", "#665c54", "#d4be98", "#a89984", "#7daea3", "#0c0e10", "#354440", "#56746d", "#7daea3"],
  everforest: ["#2d353b", "#303a40", "#475258", "#d3c6aa", "#918f84", "#7fbbb3", "#0c0e10", "#374c4c", "#587f7b", "#7fbbb3"],
  nord: ["#2e3440", "#343b49", "#4c566a", "#d8dee9", "#9fa7b4", "#81a1c1", "#0c0e10", "#384452", "#596e85", "#81a1c1"],
  kanagawa: ["#1f1f28", "#202838", "#54546d", "#dcd7ba", "#a7a492", "#dcd7ba", "#0c0e10", "#4e4c47", "#8f8c7c", "#dcd7ba"],
  "matte-black": ["#121212", "#181818", "#333333", "#eaeaea", "#8a8a8a", "#e68e0d", "#0c0e10", "#4b310a", "#925b0b", "#e68e0d"],
  "osaka-jade": ["#111c18", "#1a2a22", "#53685b", "#f7e8b2", "#969978", "#509475", "#0c0e10", "#1e372c", "#35614d", "#509475"],
  ristretto: ["#2c2525", "#342a28", "#72696a", "#e6d9db", "#aca1a2", "#f38d70", "#0c0e10", "#5a3830", "#a05f4d", "#f38d70"],
  hackerman: ["#0b0c16", "#10121f", "#2d3450", "#ddf7ff", "#a4b2ca", "#82fb9c", "#0c0e10", "#2b5037", "#539e65", "#82fb9c"],
  "retro-82": ["#05182e", "#081e37", "#2a6b78", "#f6dcac", "#9ab69b", "#faa968", "#0c0e10", "#4c3b2f", "#9c6d49", "#faa968"],
  lumon: ["#16242d", "#182836", "#304860", "#f2fcff", "#a0c1d8", "#8bc9eb", "#0c0e10", "#314956", "#5a839a", "#8bc9eb"],
  ethereal: ["#060b1e", "#0c122c", "#6d7db6", "#ffcead", "#b6a6b2", "#7d82d9", "#0c0e10", "#282b4c", "#4f538d", "#7d82d9"],
  miasma: ["#222222", "#272727", "#666666", "#c2c2b0", "#8c8c82", "#78824b", "#0c0e10", "#313423", "#515735", "#78824b"],
  "last-horizon": ["#0c0b0c", "#0c0b0c", "#584e51", "#fafcfb", "#a9a5a6", "#b59790", "#0c0e10", "#3a322f", "#72605c", "#b59790"],
  solitude: ["#101315", "#101315", "#4b4e55", "#cacccc", "#8a8d90", "#798186", "#0c0e10", "#2a2e30", "#4e5457", "#798186"],
  vantablack: ["#000000", "#0d0d0d", "#7a7a7a", "#ffffff", "#a8a8a8", "#8d8d8d", "#0c0e10", "#2f2f2f", "#5a5a5a", "#8d8d8d"],
  "rose-pine": ["#faf4ed", "#fffaf3", "#cecacd", "#575279", "#676284", "#56949f", "#ffffff", "#b7c6c5", "#8bafb4", "#56949f"],
  "catppuccin-latte": ["#eff1f5", "#f8f9fb", "#acb0be", "#4c4f69", "#5c5f77", "#1e66f5", "#ffffff", "#a0b6e4", "#6491ec", "#1e66f5"],
  "flexoki-light": ["#fffcf0", "#f9f6ea", "#b7b5ac", "#100f0f", "#555450", "#205ea6", "#ffffff", "#aabac9", "#6b90b9", "#205ea6"],
  lupine: ["#fafafa", "#ffffff", "#9e9e9e", "#000000", "#484848", "#3264eb", "#ffffff", "#aab9e2", "#7392e6", "#3264eb"],
  white: ["#ffffff", "#ffffff", "#c0c0c0", "#000000", "#4a4a4a", "#6e6e6e", "#ffffff", "#c3c3c3", "#9c9c9c", "#6e6e6e"],
};

// What a visitor gets before they pick: Omarchy's default, or its light
// counterpart when the system asks for light.
export const DEFAULT_DARK = "tokyo-night";
export const DEFAULT_LIGHT = "flexoki-light";
