import { MongoMemoryServer } from "mongodb-memory-server";

const mongod = await MongoMemoryServer.create({
  instance: { dbName: "naprocs-newsletter", port: 27117 },
});

console.log("MONGO_URI=" + mongod.getUri("naprocs-newsletter"));
console.log("READY");

process.on("SIGINT", async () => {
  await mongod.stop();
  process.exit(0);
});
