const csvReader = require('../src/helper/csvReader')
const fs = require('fs');
describe("test csvReader", ()=> {
    it('should convert to domain ids', async ()=>{
        const data = fs.createReadStream(__dirname + '/test.csv');
        const expected = new Set();
        expected.add('a1omrh9xxw15k9')
        expected.add('b1omrh9xxw15k9')
        const result = await csvReader(data)
        expect(result).toStrictEqual(expected)
    })

    it('should handle null case', async ()=>{
        const data = fs.createReadStream(__dirname + '/testNull.csv');
        const expected = new Set();
        const result = await csvReader(data)
        expect(result).toStrictEqual(expected)
    })
})