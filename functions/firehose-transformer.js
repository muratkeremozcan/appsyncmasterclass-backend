// [93] Configure Kinesis Firehose
// (93.0) use a lambda to transform the data into a Kinesis Firehose stream (it comes as a JSON object but not formatted line by line)
module.exports.handler = async event => {
  const output = event.records.map(record => {
    const data = Buffer.from(record.data, 'base64').toString()
    const newData = data + '\n'

    return {
      recordId: record.recordId,
      result: 'Ok',
      data: Buffer.from(newData).toString('base64'),
    }
  })

  return {records: output}
}
