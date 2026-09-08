import {Router} from "express";
import {authenticate} from "../../lib/auth/guard";
import {rbac} from "../../lib/auth/rbac";
import {container} from "../../lib/di/container";
import {TOKENS} from "../../lib/di/tokens";
import {MediaController} from "./controller/media.controller";

export const mediaRouter = Router();

const mediaController = container.resolve<MediaController>(TOKENS.MediaController);

// Every route is authenticated and behind rbac(), which admits only
// system_admin (bypass) and restaurant_user holding the permission — customers
// and delivery agents are rejected by rbac() itself.
mediaRouter.post('/uploads',
    authenticate,
    rbac({resource: "core:media", action: 'create'}),
    mediaController.createUpload,
);
mediaRouter.post('/:id/complete',
    authenticate,
    rbac({resource: "core:media", action: 'create'}),
    mediaController.complete,
);
mediaRouter.get('/:id',
    authenticate,
    rbac({resource: "core:media", action: 'read'}),
    mediaController.findById,
);
mediaRouter.delete('/:id',
    authenticate,
    rbac({resource: "core:media", action: 'delete'}),
    mediaController.remove,
);
