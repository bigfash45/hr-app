import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHostComponent } from './shared/ui/toast/toast-host.component';
import { DialogHostComponent } from './shared/ui/dialog/dialog-host.component';
import { LoadingService } from './core/http/loading.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent, DialogHostComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  /** Drives the thin progress bar at the top of the viewport. */
  protected readonly loading = inject(LoadingService);
}
