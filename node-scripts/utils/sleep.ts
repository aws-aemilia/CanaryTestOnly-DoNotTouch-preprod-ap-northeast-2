const sleep = (durationMillis: number) => new Promise((res) => setTimeout(res, durationMillis));

export default sleep;