const request = require('request-promise');

module.exports.Batch = async function (){
    let url = `http://localhost:${process.env.API_PORT}/batch`;
    let res_ = await get_data(url, 'GET', {});
    if(res_.success) console.log('Batch Started .................');
    else {
        console.log('Batch was Started with Error');
        process.exit(1);
    }

    return res_.success;
}

module.exports.Init = async function (){
    let url = `http://localhost:${process.env.API_PORT}/init`;
    let res_ = await get_data(url, 'GET', {});
    if(res_.success) console.log('Batch Started .................');
    else {
        console.log('Init was Started with Error');
        process.exit(1);
    }

    return res_.success;
}

async function get_data(url, method, body) {
    let res = {success: false, error: "", result: {}};
    const options = {
        method: method,
        url: url,
        body: body,
        json: true
    };
    await request(options).then(body => {
        res.success = true;
        res.result = body;
    })
    .catch(err => {
        res.error = err.message;
        console.log(`Error in ${method} ${url}: ${err.message}`);
    });
    return res;
}