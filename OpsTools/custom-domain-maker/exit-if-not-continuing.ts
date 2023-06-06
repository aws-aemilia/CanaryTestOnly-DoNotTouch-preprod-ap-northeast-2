import { validateResponseWithMessage } from './validate-response-with-message';

export async function exitIfNotContinuing() {
    const continueCheck = await validateResponseWithMessage({
        prompt: 'Continue? (y/n) ',
        regex: /^[yn]|yes|no$/,
        errorMessage: 'Only y, n, yes, or no are acceptable.'
    });

    if(continueCheck.includes('n')) {
        process.exit(1);
    }
}