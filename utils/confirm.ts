import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function confirm(prompt: string) {
  return new Promise<boolean>((resolve, reject) => {
    rl.question(`${prompt} [y/N]: `, (answer: string) => {
      if (answer === "y") resolve(true);
      else resolve(false);
      rl.close();
    });
  });
}

export default confirm;
