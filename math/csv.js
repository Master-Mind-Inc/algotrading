const fs = require('fs');

function ObjectsToCSV(path, arr, headers){
    if (arr.length > 0){
        headers = headers || Object.keys(arr[0]);
        let tofile = headers.join(',')+ '\n';
        for(let i = 0; i < arr.length; i++){
            let row = [];
            for (let c = 0; c < headers.length; c++){
                row.push(arr[i][headers[c]]);
            }
            tofile += `${row.join(',')}\n`;
        }
        fs.writeFile(path, tofile, (error,data) => {});
    }
    else {
        console.log("Nothing to CSV");
    }
}

function CSVTo(toArray, path, skip, toNumber, headers){
    let [str, arr] = ['', []];
    try {
        str = fs.readFileSync(path, {encoding: 'utf-8'});
    } catch (error) {
        console.log(error);
        return arr;
    }
    let strArray = str.split('\n');
    if (strArray.length < 1+skip) {
        console.log("Nothing from CSV");
        return arr;
    }

    if (!headers) {
        headers = strArray[0].replace(/'/g, '').replace(/"/g, '').split(',').map(c => c.trim());
    }

    for(let i = skip; i < strArray.length; i++){
        let str_row_arr = strArray[i].split(',');
        if (toArray) arr.push(str_row_arr);
        else {
            let row = {};
            for (let c = 0; c < headers.length; c++)
                row[headers[c]] = (toNumber[c]) ? +str_row_arr[c] : str_row_arr[c];
            arr.push(row);
        }
    }

    return arr;
}

async function CSVTo(path, skip, toNumber, headers){
    let [str, arr] = ['', []];
    try {
        str = fs.readFileSync(path, {encoding: 'utf-8'});
    } catch (error) {
        console.log(error);
        return arr;
    }
    let strArray = str.split('\n');
    if (strArray.length < 1+skip) {
        console.log("Nothing from CSV");
        return arr;
    }

    if (!headers) {
        headers = strArray[0].replace(/'/g, '').replace(/"/g, '').split(',').map(c => c.trim());
    }

    for(let i = skip; i < strArray.length; i++){
        let str_row_arr = strArray[i].split(',');
        if (toArray) arr.push(str_row_arr);
        else {
            let row = {};
            for (let c = 0; c < headers.length; c++)
                row[headers[c]] = (toNumber[c]) ? +str_row_arr[c] : str_row_arr[c];
            arr.push(row);
        }
    }

    return arr;
}

function ObjectsToCSVString(arr, headers, separator=","){
    let tofile = '';
    if (arr.length > 0){
        headers = headers || Object.keys(arr[0]);
        tofile = headers.join(',')+ '\n';
        for(let i = 0; i < arr.length; i++){
            let row = [];
            for (let c = 0; c < headers.length; c++){
                let el = arr[i][headers[c]];
                if (Array.isArray(el)) row.push(JSON.stringify(el));
                else row.push(el);
            }
            tofile += `${row.join(separator)}\n`;
        }
    }
    else {
        console.log("Nothing to CSV");
    }
    return tofile;
}

module.exports = {ObjectsToCSV, ObjectsToCSVString, CSVTo};

