import { WorkspaceModel } from '../workspace.model';
import { WorkspaceWebhookService } from '../workspace.webhook';

jest.mock('../workspace.model', () => ({
  WorkspaceModel: {
    findById: jest.fn(),
    updateOne: jest.fn()
  }
}));

const mockFindById = WorkspaceModel.findById as unknown as jest.Mock;
const mockUpdateOne = WorkspaceModel.updateOne as unknown as jest.Mock;

function workspaceWithWebhook(url?: string) {
  mockFindById.mockReturnValue({
    select: () => ({
      lean: async () => ({ settings: { webhookUrl: url } })
    })
  });
}

describe('WorkspaceWebhookService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateOne.mockResolvedValue({});
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('posts a signed, versioned event to the configured URL and records success', async () => {
    workspaceWithWebhook('https://hooks.example.com/socialflow');
    const service = new WorkspaceWebhookService();

    await service.dispatch('ws_1', 'post.failed', { draftId: 'd_1', error: 'boom' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://hooks.example.com/socialflow');
    expect(init.method).toBe('POST');
    expect(init.headers['x-socialflow-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(JSON.parse(init.body)).toMatchObject({
      event: 'post.failed',
      data: { draftId: 'd_1', error: 'boom' }
    });
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'ws_1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          'settings.webhookLastStatus': 200,
          'settings.webhookLastError': null
        })
      })
    );
  });

  it('does nothing when the workspace has no webhook URL', async () => {
    workspaceWithWebhook('');
    const service = new WorkspaceWebhookService();

    await service.dispatch('ws_1', 'post.published', { draftId: 'd_1' });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it('records a transport failure instead of throwing into the publish path', async () => {
    workspaceWithWebhook('https://hooks.example.com/socialflow');
    (global.fetch as jest.Mock).mockRejectedValue(new Error('connect ECONNREFUSED'));
    const service = new WorkspaceWebhookService();

    await expect(service.dispatch('ws_1', 'post.failed', { draftId: 'd_1' })).resolves.toBeUndefined();
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'ws_1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          'settings.webhookLastStatus': 0,
          'settings.webhookLastError': 'connect ECONNREFUSED'
        })
      })
    );
  });
});
