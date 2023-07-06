import readline from "readline";

export async function confirm(prompt: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve, reject) => {
    rl.question(`${prompt} [y/N]: `, (answer: string) => {
      if (answer === "y") resolve(true);
      else resolve(false);
      rl.close();
    });
  });
}

export async function question(prompt: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string>((resolve, reject) => {
    rl.question(prompt, (answer: string) => {
      rl.close();
      resolve(answer);
    });
  });
}

export default confirm;
