import { expect, test } from '../../fixtures/auth.fixture';
import {
  createAncestorChain,
  removeAncestorChain,
} from '../../fixtures/ancestors';
import { e2eName } from '../../fixtures/naming';
import { systemConfig } from '../../item-configs/system.config';

/**
 * NetworkInterface has its own first-class new_/modify_/save_/remove_network_interface RPC
 * surface, but in the UI it's nested under a System (route /items/system/:name/interface/...)
 * rather than exposed as a top-level item route — so it doesn't fit item-crud.page.ts's generic
 * flow and gets its own spec here instead.
 */
test.describe('System network interface', () => {
  test('create, edit, and delete a network interface under a system', async ({
    page,
    backend,
  }, testInfo) => {
    const { chain, immediateParentUid: profileUid } = await createAncestorChain(
      backend,
      systemConfig,
      testInfo.parallelIndex,
    );
    const systemName = e2eName(testInfo.parallelIndex, 'system');
    await backend.createItem(
      'system',
      systemConfig.createFields({ name: systemName, parentUid: profileUid }),
    );

    try {
      const interfaceName = 'eth0';

      await page.goto(`/items/system/${systemName}/interface`);
      await page.locator('[data-testid="item-add-button"]').click();
      await page.locator('[formcontrolname="name"]').fill(interfaceName);
      await page
        .locator('[formcontrolname="mac_address"]')
        .fill('52:54:00:11:22:33');
      await page.locator('[data-testid="item-create-submit"]').click();
      // Creation navigates straight to the new interface's edit page (same pattern as every
      // other item type's create dialog), not back to the overview list.
      await expect(page).toHaveURL(new RegExp(`/interface/${interfaceName}`));

      // The IPv4 and IPv6 field groups both render a plain "MTU" label (only their enclosing
      // option-group card's heading distinguishes them), so scope to the "IPv4" card first.
      const ipv4Card = page.locator('mat-card').filter({ hasText: 'IPv4' });

      await page.locator('[data-testid="item-edit-toggle"]').click();
      await ipv4Card.getByLabel('MTU').fill('1500');
      await page.locator('[data-testid="item-save-button"]').click();
      await page.reload();
      await expect(ipv4Card.getByLabel('MTU')).toHaveValue('1500');

      await page.goto(`/items/system/${systemName}/interface`);
      await page
        .getByRole('row', { name: interfaceName })
        .getByRole('button')
        .click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await expect(page.getByRole('row', { name: interfaceName })).toHaveCount(
        0,
      );
    } finally {
      await backend.removeItem('system', systemName, true).catch(() => {});
      await removeAncestorChain(backend, chain);
    }
  });

  /**
   * Regression test for a backend bug (fixed alongside an internal `keep_uid` make_clone()
   * param): copying a System that has a NetworkInterface with a real IP/MAC/DNS used to fail
   * with a false "duplicate IP/MAC/DNS" validation error, because the clone's interface was
   * being compared against its own not-yet-renamed source instead of being excluded from the
   * uniqueness check.
   */
  test('cloning a system with a configured network interface does not trigger a false duplicate-IP/MAC/DNS error', async ({
    page,
    backend,
  }, testInfo) => {
    const { chain, immediateParentUid: profileUid } = await createAncestorChain(
      backend,
      systemConfig,
      testInfo.parallelIndex,
    );
    const systemName = e2eName(testInfo.parallelIndex, 'system');
    const cloneName = `${systemName}-clone`;
    await backend.createItem(
      'system',
      systemConfig.createFields({ name: systemName, parentUid: profileUid }),
    );

    try {
      const interfaceName = 'eth0';
      await page.goto(`/items/system/${systemName}/interface`);
      await page.locator('[data-testid="item-add-button"]').click();
      await page.locator('[formcontrolname="name"]').fill(interfaceName);
      await page
        .locator('[formcontrolname="mac_address"]')
        .fill('52:54:00:aa:bb:cc');
      await page.locator('[data-testid="item-create-submit"]').click();
      await expect(page).toHaveURL(new RegExp(`/interface/${interfaceName}`));

      await page.goto(`/items/system/${systemName}`);
      await page
        .locator('button')
        .filter({ has: page.locator('mat-icon', { hasText: 'content_copy' }) })
        .click();
      await page.getByLabel('New name').fill(cloneName);
      await page.getByRole('button', { name: 'Copy', exact: true }).click();

      // A false duplicate-validation error would surface as a snackbar and keep the page on the
      // source system's edit URL instead of navigating to the clone.
      await expect(page).toHaveURL(new RegExp(`/items/system/${cloneName}`));

      await page.goto(`/items/system/${cloneName}/interface`);
      await expect(
        page.getByRole('row', { name: interfaceName }),
      ).toBeVisible();
    } finally {
      await backend.removeItem('system', cloneName, true).catch(() => {});
      await backend.removeItem('system', systemName, true).catch(() => {});
      await removeAncestorChain(backend, chain);
    }
  });
});
