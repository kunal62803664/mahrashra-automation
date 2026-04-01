// bootstrap.cjs
(async () => {
  try {
    // Only start your main ESM code
    await import('./index.js');
  } catch (err) {
    console.error("Failed to start app:", err);
    process.exit(1);
  }
})();