import readline from 'readline';

export async function readLineAsync(prompt: string): Promise<string> {
    const readlineInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        readlineInterface.question(prompt, function (response) {
            resolve(response.trim());
            readlineInterface.close();
        });
    });
}