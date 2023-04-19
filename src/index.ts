import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { Server, IncomingMessage, ServerResponse } from 'http';
import { env } from './env';

import { createQueue, setupQueueProcessor } from './queue';

interface AddJobQueryString {
  id: string;
  links: string;
  chatbot_id: number;
}

const run = async () => {
  const linksQueue = createQueue('LinksQueue');
  const contentQueue = createQueue('ContentQueue');
  await setupQueueProcessor(linksQueue.name);
  await setupQueueProcessor(contentQueue.name);

  const server: FastifyInstance<Server, IncomingMessage, ServerResponse> =
    fastify();

  const serverAdapter = new FastifyAdapter();
  createBullBoard({
    queues: [new BullMQAdapter(linksQueue), new BullMQAdapter(contentQueue)],
    serverAdapter,
  });
  serverAdapter.setBasePath('/');
  server.register(serverAdapter.registerPlugin(), {
    prefix: '/',
    basePath: '/',
  });

  server.get(
    '/links/add-job',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            id: { type: 'string' },
          },
        },
      },
    },
    (req: FastifyRequest<{ Querystring: AddJobQueryString }>, reply) => {
      if (
        req.query == null ||
        req.query.links == null ||
        req.query.chatbot_id == null
      ) {
        reply
          .status(400)
          .send({ error: 'Requests must contain both an id and a email' });

        return;
      }

      const { links, chatbot_id } = req.query;
      linksQueue.add(`Link-${id}`, { links, chatbot_id: parseInt(chatbot_id, 10) });

      reply.send({
        ok: true,
      });
    }
  );

  server.get(
    '/content/add-job',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            id: { type: 'string' },
          },
        },
      },
    },
    (req: FastifyRequest<{ Querystring: AddJobQueryString }>, reply) => {
      if (
        req.query == null ||
        req.query.base_link == null ||
        req.query.website_link_id == null ||
        req.query.path == null
      ) {
        reply
          .status(400)
          .send({ error: 'Requests must contain both an id and a email' });

        return;
      }

      const { base_link, website_link_id, path } = req.query;
      contentQueue.add(`Content-${website_link_id}`, { base_link, path, website_link_id: parseInt(website_link_id, 10) });

      reply.send({
        ok: true,
      });
    }
  );

  server.get('/links/queue', async (_, reply) => {
    const jobs = await linksQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
    reply.send(jobs.map((job) => ({ id: job.id, data: job.data })));
  });

  server.get('/content/queue', async (_, reply) => {
    const jobs = await contentQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
    reply.send(jobs.map((job) => ({ id: job.id, data: job.data })));
  });

  await server.listen({ port: env.PORT, host: '0.0.0.0' });
  console.log(
    `To populate the queue and demo the UI, run:\n
    curl https://${env.RAILWAY_STATIC_URL}/link/add-job?chatbot_id=<chatbot_id>&links=<base64_link>\n
    curl https://${env.RAILWAY_STATIC_URL}/content/add-job?base_link=<base64_link>&website_link_id=<website_link_id>&path=<base64_path>>\n
    curl https://${env.RAILWAY_STATIC_URL}/links/queue\n
    curl https://${env.RAILWAY_STATIC_URL}/content/queue\n
    `
  );
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
