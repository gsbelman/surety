import { motion } from "motion/react";

const BLOBS = [
  { name: "lavender", x: ["0vmax", "9vmax"], y: ["0vmax", "7vmax"], duration: 26 },
  { name: "sky", x: ["0vmax", "-8vmax"], y: ["0vmax", "10vmax"], duration: 32 },
  { name: "mint", x: ["0vmax", "10vmax"], y: ["0vmax", "-8vmax"], duration: 29 },
  { name: "peach", x: ["0vmax", "-10vmax"], y: ["0vmax", "-6vmax"], duration: 35 },
];

/**
 * A slow pastel mesh. Each blob is a soft gradient that moves by transform only, so the compositor
 * does the work. The cards sit on translucent white with no backdrop blur for the same reason.
 */
export function Background() {
  return (
    <div className="mesh" aria-hidden="true">
      {BLOBS.map(({ name, x, y, duration }) => (
        <motion.span
          key={name}
          className={`blob ${name}`}
          animate={{ x, y }}
          transition={{ duration, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
