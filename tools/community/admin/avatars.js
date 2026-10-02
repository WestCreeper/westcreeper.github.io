window.communityAvatar = (value) => {
  const known = new Set([
    "moss",
    "fox",
    "axolotl",
    "slime",
    "robot",
    "ghost",
    "mushroom",
    "eye",
  ]);
  const image = document.createElement("img");
  image.src =
    "https://westcreeper.com/assets/images/avatars/" +
    (known.has(value) ? value : "moss") +
    ".svg";
  image.alt = "";
  image.width = 40;
  image.height = 40;
  image.className = "avatar";
  return image;
};
