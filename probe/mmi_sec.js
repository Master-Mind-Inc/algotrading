const crypto = require('crypto');
const fs = require('fs');
function encryptStringWithRsaPublicKey (toEncrypt, path) {
    var publicKey = fs.readFileSync(path, "utf8");
    console.log(`publicKey: ${publicKey}`);
    var encrypted = crypto.publicEncrypt(publicKey, Buffer.from(toEncrypt));
    return encrypted.toString("base64");
};

function decryptStringWithRsaPrivateKey (toDecrypt, path) {
    var privateKey = fs.readFileSync(path, "utf8");
    var decrypted = crypto.privateDecrypt(privateKey, Buffer.from(toDecrypt, "base64"));
    return decrypted.toString("utf8");
};

function main(){
    let API_SEC = fs.readFileSync('/home/martin/.ssh/mmi_rsa', {encoding: 'utf8', flag: 'r'}).split('\n').slice(1,26).join('');
    if (process.argv < 3) {
        console.log('Should be Word to encrypt');
        process.exit(1);
    }
    let query = process.argv[2];
    console.log(`before: ${query}`);
    let encr = encryptStringWithRsaPublicKey(query, '/home/martin/mmi_rsa.pem');
    console.log(`encr: ${encr}`);
    let decr = decryptStringWithRsaPrivateKey(encr, '/home/martin/mmi_rsa');
    console.log(`after: ${decr}`);
}
main();