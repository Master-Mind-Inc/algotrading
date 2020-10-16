const fs = require('fs');
const { Transform } = require('stream');

class Linearizer extends Transform {
    constructor(options) {
        super(options);
        this.tail = '';
        if (options.headers) {
            this.headers = options.headers;
            this.first_line_filled = false;
        }
    }
    _transform(chunk, encoding, callback) {
        let arr = (this.tail + chunk.toString()).split('\n');
        for (let i = 0; i < arr.length - 1; i++){
            if (arr[i].length > 0) {
                if (this.headers && !this.first_line_filled) {
                    this.first_line_filled = true;
                    this.headers.push(... arr[i].split(','));
                }
                else this.push(arr[i]);
            }
        }
        if (arr[arr.length - 1].length > 0) {
            if (this.headers && !this.first_line_filled) {
                this.first_line_filled = true;
                this.headers.push(... arr[arr.length - 1].split(','));
                this.tail = '';
            }
            else this.tail = arr[arr.length - 1];
        }
        else this.tail = '';
        callback();
    }
    _flush(callback) {
        if (this.tail.length > 0) this.push(this.tail);
        this.tail = '';
        callback();
    }
}

class Lines_To_Arr extends Transform {
    constructor(options) {
        super(options);
        this.headers = options.headers;
        this.arr = options.arr;
        this.as_numbers = options.as_numbers;
    }
    _transform(chunk, encoding, callback) {
        let a = {};
        let row = chunk.toString().split(',');
        for (let h = 0; h < this.headers.length; h++)
            a[this.headers[h]] = (this.as_numbers[h]) ? +row[h] : row[h];
        this.arr.push(a);
        callback();
    }
}

module.exports.load = async function(path, as_numbers=[]){
    let [arr, headers] = [[], []];
    const file_stream = new fs.ReadStream(path);
    const line_stream = new Linearizer({headers});
    const lines_to_arr_stream = new Lines_To_Arr({headers, arr, as_numbers});
    
    file_stream.pipe(line_stream).pipe(lines_to_arr_stream);

    await finalize();
    return arr;

    function finalize(){
        return new Promise(resolve=>{
            lines_to_arr_stream.on('finish', () => resolve());
        })
    }
}
